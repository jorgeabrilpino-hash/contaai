import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { classifyIntent, chatContador, type ChatContext } from '@/lib/gemma'

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

async function sendMessage(chatId: number, text: string): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
}

// Telegram corta la conexión si tardamos: avisar "escribiendo..." mientras
// Gemma 4 piensa mejora mucho la sensación de chat real.
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
  `3. Toca el botón "Abrir Telegram" o envíame: <code>/start TU_CÓDIGO</code>`

const AYUDA_MESSAGE =
  `🤖 <b>ContaAI</b> — Soy tu asistente contable. Háblame con normalidad:\n\n` +
  `💬 <i>"¿Cuánto IGV llevo este mes?"</i>\n` +
  `💬 <i>"¿Cuándo vence mi declaración?"</i>\n` +
  `💬 <i>"¿Qué cuenta PCGE uso para compras de gasolina?"</i>\n\n` +
  `📎 <b>Subir documentos:</b> escribe "subir factura" y te genero un enlace seguro de 15 minutos.\n\n` +
  `🏢 <b>Cambiar empresa:</b> /empresa [nombre]\n` +
  `🔐 <b>Tu sesión:</b> /cuenta (ver cuenta vinculada) · /cerrar (cerrar sesión)\n` +
  `📱 Dashboard: ${process.env.NEXT_PUBLIC_APP_URL}`

// Enmascara el email para mostrarlo sin exponerlo completo: jo*****@gmail.com
function maskEmail(email: string | null | undefined): string {
  if (!email) return 'sin email registrado'
  const [user, domain] = email.split('@')
  if (!domain) return '***'
  return `${user.slice(0, 2)}${'*'.repeat(Math.max(user.length - 2, 1))}@${domain}`
}

// GET: register webhook with Telegram (call once after deploy)
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

// Datos agregados del período — única información que puede ver el bot.
// NUNCA consulta RUCs, razones sociales ni montos individuales.
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
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    vencimientoDias,
  }
}

// Respuesta de plantilla si Gemma 4 no está disponible
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
  // 1. Verify Telegram secret
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
  const text = (message.text as string) || ''
  const hasFile =
    !!message.document || !!message.photo || !!message.audio || !!message.video

  // 2. Reject files — absolute security rule
  if (hasFile) {
    await sendMessage(
      chatId,
      '🔒 <b>Los documentos se suben solo desde el enlace seguro.</b>\n\n' +
      'Por seguridad, no procesamos archivos por Telegram.\n\n' +
      '📎 Escribe "subir factura" y te genero un enlace válido por 15 minutos.'
    )
    return NextResponse.json({ ok: true })
  }

  const admin = createAdminClient()

  // 3. Handle /start (with or without token)
  if (text.startsWith('/start')) {
    const linkToken = text.replace('/start', '').trim()

    if (linkToken) {
      // Linking flow: /start TOKEN
      const { data: profileToLink } = await admin
        .from('profiles')
        .select('id, nombre')
        .eq('telegram_token', linkToken)
        .single()

      if (profileToLink) {
        // Cambio de cuenta: si este Telegram ya estaba vinculado a OTRA cuenta,
        // desvincularla primero (telegram_id es UNIQUE — sin esto el update
        // nuevo fallaría silenciosamente y el usuario creería que se vinculó).
        const { data: cuentaAnterior } = await admin
          .from('profiles')
          .select('id, nombre')
          .eq('telegram_id', chatId)
          .neq('id', profileToLink.id)
          .maybeSingle()

        if (cuentaAnterior) {
          await admin
            .from('profiles')
            .update({ telegram_id: null })
            .eq('id', cuentaAnterior.id)
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

        // Identidad de la cuenta vinculada (email enmascarado como validación)
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

    // /start alone — check if already linked
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id, nombre')
      .eq('telegram_id', chatId)
      .single()

    if (existingProfile) {
      await sendMessage(
        chatId,
        `👋 ¡Hola de nuevo, <b>${existingProfile.nombre ?? 'Contador'}</b>!\n\n` + AYUDA_MESSAGE
      )
    } else {
      await sendMessage(
        chatId,
        `👋 ¡Hola! Bienvenido a ContaAI.\n\n` + INSTRUCCIONES_VINCULACION
      )
    }
    return NextResponse.json({ ok: true })
  }

  // 4. Load profile by telegram_id for all other commands
  const { data: profile } = await admin
    .from('profiles')
    .select('id, nombre')
    .eq('telegram_id', chatId)
    .single()

  if (!profile) {
    await sendMessage(
      chatId,
      '👋 ¡Hola! Para usar ContaAI necesitas vincular tu cuenta.\n\n' +
      INSTRUCCIONES_VINCULACION
    )
    return NextResponse.json({ ok: true })
  }

  // 4b. /cuenta — validar qué cuenta está vinculada a este Telegram
  if (text.startsWith('/cuenta')) {
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

  // 4c. /cerrar — cerrar sesión del bot desde el propio chat
  if (text.startsWith('/cerrar') || text.startsWith('/logout')) {
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
        `Para volver a conectarte (con esta u otra cuenta):\n` +
        INSTRUCCIONES_VINCULACION
      )
    }
    return NextResponse.json({ ok: true })
  }

  // 5. Load empresas for this user
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

  // 6. Handle /empresa NOMBRE — switch active empresa
  let empresa = empresas[0]

  if (text.startsWith('/empresa')) {
    const nombreBuscado = text.replace('/empresa', '').trim().toLowerCase()

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

  if (text.startsWith('/ayuda') || text.startsWith('/help')) {
    await sendMessage(chatId, AYUDA_MESSAGE)
    return NextResponse.json({ ok: true })
  }

  const periodo = new Date().toISOString().slice(0, 7)

  // 7. "subir factura" → acción directa: generar enlace seguro de 15 min
  const intent = await classifyIntent(text)

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
        `⏰ Expira en 15 minutos. Ábrelo desde tu dispositivo, sube el comprobante ` +
        `y Gemma 4 lo clasificará automáticamente.`
      )
    } else {
      await sendMessage(chatId, '❌ Error al generar el enlace. Intenta nuevamente.')
    }
    return NextResponse.json({ ok: true })
  }

  // 8. Todo lo demás → chat inteligente con Gemma 4 sobre datos agregados
  await sendTyping(chatId)
  const ctx = await buildContext(admin, empresa, empresas, profile.nombre, periodo)

  try {
    const respuesta = await chatContador(text, ctx)
    await sendMessage(chatId, respuesta)
  } catch {
    // Gemma no disponible → resumen de plantilla con los datos reales
    await sendMessage(chatId, fallbackReply(ctx))
  }

  return NextResponse.json({ ok: true })
}
