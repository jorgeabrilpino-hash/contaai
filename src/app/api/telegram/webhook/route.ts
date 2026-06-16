import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { classifyIntent, chatContador, type ChatContext } from '@/lib/gemma'
import { transcribeVoice } from '@/lib/whisper'

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

async function sendMessage(chatId: number, text: string): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
}

async function sendTyping(chatId: number): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
  })
}

const INSTRUCCIONES_VINCULACION =
  `Para vincular tu cuenta:\n\n` +
  `1. Ve a <b>${process.env.NEXT_PUBLIC_APP_URL}/config</b>\n` +
  `2. Haz clic en "Conectar Telegram"\n` +
  `3. Escanea el QR o toca "Abrir Telegram" y pulsa START`

const AYUDA_MESSAGE =
  `🤖 <b>ContaAI</b> — Soy tu asistente contable. Háblame con normalidad:\n\n` +
  `💬 <i>"¿Cuánto IGV llevo este mes?"</i>\n` +
  `💬 <i>"¿Cuándo vence mi declaración?"</i>\n` +
  `💬 <i>"¿Qué cuenta PCGE uso para compras de gasolina?"</i>\n` +
  `🎙 <i>También puedes enviar una nota de voz</i> (máx 30 segundos)\n\n` +
  `📎 <b>Subir documentos:</b> escribe "subir factura" para un enlace seguro de 15 min.\n\n` +
  `🏢 <b>Cambiar empresa:</b> /empresa [nombre]\n` +
  `🔐 <b>Tu sesión:</b> /cuenta (ver cuenta) · /cerrar (cerrar sesión)\n` +
  `📱 Dashboard: ${process.env.NEXT_PUBLIC_APP_URL}`

function maskEmail(email: string | null | undefined): string {
  if (!email) return 'sin email registrado'
  const [user, domain] = email.split('@')
  if (!domain) return '***'
  return `${user.slice(0, 2)}${'*'.repeat(Math.max(user.length - 2, 1))}@${domain}`
}

export async function GET(): Promise<NextResponse> {
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/telegram/webhook`
  const res = await fetch(`${TELEGRAM_API}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ['message'],
    }),
  })
  return NextResponse.json(await res.json())
}

type EmpresaRow = { id: string; nombre: string }

async function buildContext(
  admin: ReturnType<typeof createAdminClient>,
  empresa: EmpresaRow,
  empresas: EmpresaRow[],
  contadorNombre: string | null,
  periodo: string
): Promise<ChatContext> {
  const { data: docs } = await admin
    .from('documentos')
    .select('igv, monto_base, estado')
    .eq('empresa_id', empresa.id)
    .eq('periodo', periodo)

  const rows = docs ?? []
  const totalIGV = rows.reduce((s, d) => s + ((d.igv as number) ?? 0), 0)
  const totalBase = rows.reduce((s, d) => s + ((d.monto_base as number) ?? 0), 0)
  const confirmados = rows.filter(d => d.estado === 'confirmado').length

  const now = new Date()
  const vencimiento = new Date(now.getFullYear(), now.getMonth() + 1, 15)
  const vencimientoDias = Math.ceil(
    (vencimiento.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  )

  return {
    contadorNombre,
    empresaNombre: empresa.nombre,
    empresas: empresas.map(e => e.nombre),
    periodo,
    totalIGV,
    totalBase,
    totalDocs: rows.length,
    confirmados,
    pendientes: rows.length - confirmados,
    vencimientoFecha: vencimiento.toLocaleDateString('es-PE', {
      day: 'numeric', month: 'long', year: 'numeric',
    }),
    vencimientoDias,
  }
}

function fallbackReply(ctx: ChatContext): string {
  return (
    `📊 <b>${ctx.empresaNombre} — ${ctx.periodo}</b>\n\n` +
    `💰 IGV acumulado: <b>S/ ${ctx.totalIGV.toFixed(2)}</b>\n` +
    `🧾 Base imponible: <b>S/ ${ctx.totalBase.toFixed(2)}</b>\n` +
    `📄 Documentos: ${ctx.totalDocs} (✅ ${ctx.confirmados} · ⏳ ${ctx.pendientes})\n` +
    `📅 Próxima declaración: ${ctx.vencimientoFecha} (${ctx.vencimientoDias} días)\n\n` +
    `📎 Escribe "subir factura" para obtener un enlace de subida.`
  )
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Verificar secret de Telegram
  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let update: Record<string, unknown>
  try {
    update = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const message = update.message as Record<string, unknown> | undefined
  if (!message) return NextResponse.json({ ok: true })

  const chatId = (message.chat as Record<string, unknown>).id as number
  let userText = (message.text as string) || ''

  // Notas de voz: procesamos solo el tipo "voice" (grabado con el micrófono).
  // "audio" (archivos de música) y "document" siguen rechazándose.
  const voiceMsg = message.voice as { file_id: string; duration: number } | undefined

  // Rechazar archivos que NO sean voz
  const hasDisallowedFile =
    !!message.document || !!message.photo || !!message.audio || !!message.video

  if (hasDisallowedFile) {
    await sendMessage(
      chatId,
      '🔒 <b>Los documentos se suben solo desde el enlace seguro.</b>\n\n' +
      'Por seguridad, no procesamos archivos por Telegram.\n\n' +
      '📎 Escribe "subir factura" y te genero un enlace válido por 15 minutos.'
    )
    return NextResponse.json({ ok: true })
  }

  const admin = createAdminClient()

  // 2. Manejar /start (con o sin token de vinculación)
  if (userText.startsWith('/start')) {
    const linkToken = userText.replace('/start', '').trim()

    if (linkToken) {
      const { data: profileToLink } = await admin
        .from('profiles')
        .select('id, nombre')
        .eq('telegram_token', linkToken)
        .single()

      if (profileToLink) {
        // Desvincular cuenta anterior si este Telegram ya estaba conectado
        const { data: cuentaAnterior } = await admin
          .from('profiles')
          .select('id, nombre')
          .eq('telegram_id', chatId)
          .neq('id', profileToLink.id)
          .maybeSingle()

        if (cuentaAnterior) {
          await admin.from('profiles').update({ telegram_id: null }).eq('id', cuentaAnterior.id)
        }

        const { error: linkError } = await admin
          .from('profiles')
          .update({ telegram_id: chatId, telegram_token: null })
          .eq('id', profileToLink.id)

        if (linkError) {
          await sendMessage(
            chatId,
            '❌ No se pudo completar la vinculación. Genera un código nuevo en la app e intenta otra vez.'
          )
          return NextResponse.json({ ok: true })
        }

        const { data: userData } = await admin.auth.admin.getUserById(profileToLink.id)
        const emailMasked = maskEmail(userData?.user?.email)

        await sendMessage(
          chatId,
          `✅ ¡Cuenta vinculada correctamente!\n\n` +
          `👤 <b>${profileToLink.nombre ?? 'Contador'}</b>\n` +
          `📧 <code>${emailMasked}</code>\n` +
          (cuentaAnterior
            ? `\n🔄 Este Telegram estaba vinculado a la cuenta de <b>${cuentaAnterior.nombre ?? 'otro usuario'}</b> — esa sesión se cerró automáticamente.\n`
            : '') +
          `\nSi no reconoces esta cuenta, envía /cerrar.\n\n` +
          AYUDA_MESSAGE
        )
      } else {
        await sendMessage(
          chatId,
          '❌ Código inválido o expirado. Genera uno nuevo en la app.\n\n' +
          INSTRUCCIONES_VINCULACION
        )
      }
      return NextResponse.json({ ok: true })
    }

    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id, nombre')
      .eq('telegram_id', chatId)
      .single()

    await sendMessage(
      chatId,
      existingProfile
        ? `👋 ¡Hola de nuevo, <b>${existingProfile.nombre ?? 'Contador'}</b>!\n\n` + AYUDA_MESSAGE
        : `👋 ¡Hola! Bienvenido a ContaAI.\n\n` + INSTRUCCIONES_VINCULACION
    )
    return NextResponse.json({ ok: true })
  }

  // 3. Cargar perfil para todos los demás mensajes
  const { data: profile } = await admin
    .from('profiles')
    .select('id, nombre')
    .eq('telegram_id', chatId)
    .single()

  if (!profile) {
    // Usuario no vinculado — mensaje de voz o texto
    if (voiceMsg) {
      await sendMessage(
        chatId,
        '🎙 Recibí tu nota de voz, pero primero necesitas vincular tu cuenta.\n\n' +
        INSTRUCCIONES_VINCULACION
      )
    } else {
      await sendMessage(
        chatId,
        '👋 ¡Hola! Para usar ContaAI necesitas vincular tu cuenta.\n\n' +
        INSTRUCCIONES_VINCULACION
      )
    }
    return NextResponse.json({ ok: true })
  }

  // 4. Comandos de sesión
  if (userText.startsWith('/cuenta')) {
    const { data: userData } = await admin.auth.admin.getUserById(profile.id)
    await sendMessage(
      chatId,
      `🔐 <b>Sesión activa en este chat</b>\n\n` +
      `👤 ${profile.nombre ?? 'Contador'}\n` +
      `📧 <code>${maskEmail(userData?.user?.email)}</code>\n\n` +
      `Para cerrar sesión envía /cerrar.\n` +
      `Para vincular otra cuenta: cierra sesión y usa el código de la otra cuenta desde ${process.env.NEXT_PUBLIC_APP_URL}/config`
    )
    return NextResponse.json({ ok: true })
  }

  if (userText.startsWith('/cerrar') || userText.startsWith('/logout')) {
    const { error: unlinkError } = await admin
      .from('profiles')
      .update({ telegram_id: null })
      .eq('id', profile.id)

    if (unlinkError) {
      await sendMessage(chatId, '❌ No se pudo cerrar la sesión. Intenta de nuevo.')
    } else {
      await sendMessage(
        chatId,
        `👋 Sesión cerrada, <b>${profile.nombre ?? 'Contador'}</b>.\n\n` +
        `Este chat ya no tiene acceso a ningún dato contable.\n\n` +
        `Para volver a conectarte:\n` + INSTRUCCIONES_VINCULACION
      )
    }
    return NextResponse.json({ ok: true })
  }

  // 5. Cargar empresas
  const { data: empresas } = await admin
    .from('empresas')
    .select('id, nombre')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: true })

  if (!empresas || empresas.length === 0) {
    await sendMessage(
      chatId,
      '⚠️ No tienes empresas registradas.\n\n' +
      `Crea una en: ${process.env.NEXT_PUBLIC_APP_URL}/empresas`
    )
    return NextResponse.json({ ok: true })
  }

  let empresa = empresas[0]

  if (userText.startsWith('/empresa')) {
    const nombreBuscado = userText.replace('/empresa', '').trim().toLowerCase()
    if (!nombreBuscado) {
      const lista = empresas.map(e => `• ${e.nombre}`).join('\n')
      await sendMessage(chatId, `🏢 Tus empresas:\n\n${lista}\n\nUsa: /empresa [nombre]`)
      return NextResponse.json({ ok: true })
    }
    const match = empresas.find(e => e.nombre.toLowerCase().includes(nombreBuscado))
    if (match) {
      empresa = match
      await sendMessage(chatId, `✅ Empresa activa: <b>${match.nombre}</b>`)
    } else {
      const lista = empresas.map(e => `• ${e.nombre}`).join('\n')
      await sendMessage(chatId, `❌ No encontré esa empresa. Tus empresas:\n\n${lista}`)
    }
    return NextResponse.json({ ok: true })
  }

  if (userText.startsWith('/ayuda') || userText.startsWith('/help')) {
    await sendMessage(chatId, AYUDA_MESSAGE)
    return NextResponse.json({ ok: true })
  }

  // 6. Transcribir nota de voz con Groq Whisper (si aplica)
  if (voiceMsg) {
    if (voiceMsg.duration > 30) {
      await sendMessage(
        chatId,
        '⏱ Las notas de voz deben ser de máximo <b>30 segundos</b>.\n\n' +
        'Para preguntas largas, escríbelas por texto.'
      )
      return NextResponse.json({ ok: true })
    }

    await sendTyping(chatId)
    try {
      userText = await transcribeVoice(voiceMsg.file_id)
      // Confirmar al usuario lo que se entendió
      await sendMessage(chatId, `🎙 <i>Entendí: "${userText}"</i>`)
    } catch {
      await sendMessage(
        chatId,
        '🎙 No pude entender la nota de voz. ¿Puedes escribir tu pregunta por texto?'
      )
      return NextResponse.json({ ok: true })
    }
  }

  // 7. Si no hay texto (ni voz ni texto), ignorar silenciosamente
  if (!userText.trim()) return NextResponse.json({ ok: true })

  const periodo = new Date().toISOString().slice(0, 7)

  // 8. "subir factura" → generar enlace seguro
  const intent = await classifyIntent(userText)

  if (intent === 'upload') {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
    const uploadToken = crypto.randomUUID()
    const { data: tokenData } = await admin
      .from('upload_tokens')
      .insert({
        token: uploadToken,
        empresa_id: empresa.id,
        user_id: profile.id,
        expires_at: expiresAt.toISOString(),
        usado: false,
      })
      .select('token')
      .single()

    if (tokenData) {
      const uploadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/upload/${tokenData.token}`
      await sendMessage(
        chatId,
        `📎 <b>Enlace de subida — ${empresa.nombre}</b>\n\n` +
        `${uploadUrl}\n\n` +
        `⏰ Expira en 15 minutos. Ábrelo, toma la foto del comprobante ` +
        `y Gemma 4 lo clasificará automáticamente.`
      )
    } else {
      await sendMessage(chatId, '❌ Error al generar el enlace. Intenta nuevamente.')
    }
    return NextResponse.json({ ok: true })
  }

  // 9. Chat inteligente con Gemma 4
  await sendTyping(chatId)
  const ctx = await buildContext(admin, empresa, empresas, profile.nombre, periodo)

  try {
    const respuesta = await chatContador(userText, ctx)
    await sendMessage(chatId, respuesta)
  } catch {
    await sendMessage(chatId, fallbackReply(ctx))
  }

  return NextResponse.json({ ok: true })
}
