import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { classifyIntent } from '@/lib/gemma'

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

async function sendMessage(chatId: number, text: string): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
}

const INSTRUCCIONES_VINCULACION =
  `Para vincular tu cuenta:\n\n` +
  `1. Ve a <b>${process.env.NEXT_PUBLIC_APP_URL}/config</b>\n` +
  `2. Haz clic en "Generar código de vinculación"\n` +
  `3. Envíame: <code>/start TU_CÓDIGO</code>`

const AYUDA_MESSAGE =
  `🤖 <b>ContaAI Bot</b> — Comandos disponibles:\n\n` +
  `📊 <b>Consultas rápidas:</b>\n` +
  `• "igv del mes" — IGV acumulado del período actual\n` +
  `• "facturas pendientes" — documentos por revisar\n` +
  `• "cuándo vence" — próxima declaración SUNAT\n\n` +
  `📎 <b>Subir documentos:</b>\n` +
  `• "subir factura" — enlace seguro por 15 minutos\n\n` +
  `🏢 <b>Cambiar empresa:</b>\n` +
  `• /empresa [nombre]\n\n` +
  `📱 Dashboard: ${process.env.NEXT_PUBLIC_APP_URL}`

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
      '🔒 <b>Los documentos se suben solo desde el dashboard web.</b>\n\n' +
      'Por seguridad, no procesamos archivos por Telegram.\n\n' +
      '📎 Escribe "subir factura" para obtener un enlace seguro.'
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
        await admin
          .from('profiles')
          .update({ telegram_id: chatId, telegram_token: null })
          .eq('id', profileToLink.id)

        await sendMessage(
          chatId,
          `✅ ¡Cuenta vinculada correctamente!\n\n` +
          `Hola <b>${profileToLink.nombre ?? 'Contador'}</b>, ya puedes usar ContaAI desde Telegram.\n\n` +
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

  if (text.startsWith('/empresa ')) {
    const nombreBuscado = text.replace('/empresa ', '').trim().toLowerCase()
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

  // 7. Classify intent with Gemma 4
  const periodo = new Date().toISOString().slice(0, 7)
  let intent: string
  try {
    intent = await classifyIntent(text)
  } catch {
    intent = 'unknown'
  }

  switch (intent) {
    case 'upload': {
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
      const { data: tokenData } = await admin
        .from('upload_tokens')
        .insert({
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
          `⏰ Expira en 15 minutos. Abre el enlace desde tu dispositivo y sube el comprobante.`
        )
      } else {
        await sendMessage(chatId, '❌ Error al generar el enlace. Intenta nuevamente.')
      }
      break
    }

    case 'query_igv': {
      const { data: docs } = await admin
        .from('documentos')
        .select('igv')
        .eq('empresa_id', empresa.id)
        .eq('periodo', periodo)

      const totalIGV = (docs ?? []).reduce(
        (sum, d) => sum + ((d.igv as number) ?? 0),
        0
      )

      await sendMessage(
        chatId,
        `📊 <b>IGV — ${periodo}</b>\n` +
        `🏢 ${empresa.nombre}\n\n` +
        `💰 Total IGV: <b>S/ ${totalIGV.toFixed(2)}</b>\n` +
        `📄 Documentos registrados: ${docs?.length ?? 0}`
      )
      break
    }

    case 'query_vencimiento': {
      const now = new Date()
      const vencimiento = new Date(now.getFullYear(), now.getMonth() + 1, 15)
      const diasRestantes = Math.ceil(
        (vencimiento.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )
      const fechaStr = vencimiento.toLocaleDateString('es-PE', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })

      await sendMessage(
        chatId,
        `📅 <b>Próxima declaración SUNAT</b>\n\n` +
        `📆 Fecha referencial: <b>${fechaStr}</b>\n` +
        `⏳ Faltan: <b>${diasRestantes} días</b>\n\n` +
        `ℹ️ Verifica el cronograma exacto según el último dígito de tu RUC.`
      )
      break
    }

    case 'query_facturas': {
      const { data: docs } = await admin
        .from('documentos')
        .select('estado')
        .eq('empresa_id', empresa.id)
        .eq('periodo', periodo)

      const total = docs?.length ?? 0
      const confirmados = (docs ?? []).filter(d => d.estado === 'confirmado').length
      const pendientes = total - confirmados

      await sendMessage(
        chatId,
        `📋 <b>Documentos — ${periodo}</b>\n` +
        `🏢 ${empresa.nombre}\n\n` +
        `✅ Confirmados: <b>${confirmados}</b>\n` +
        `⏳ Pendientes: <b>${pendientes}</b>\n` +
        `📊 Total: <b>${total}</b>\n\n` +
        `👉 <a href="${process.env.NEXT_PUBLIC_APP_URL}/documentos">Ver en dashboard</a>`
      )
      break
    }

    default:
      await sendMessage(chatId, AYUDA_MESSAGE)
  }

  return NextResponse.json({ ok: true })
}
