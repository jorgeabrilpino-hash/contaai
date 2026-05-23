import { createAdminClient } from '@/lib/supabase/admin'

async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    }
  )
}

type DocResumen = {
  tipo: string
  total: number | null
  cuenta: string
  nombre_cuenta: string
  confianza: number
}

export async function notifyContador(
  empresaId: string,
  resumen: DocResumen
): Promise<void> {
  const admin = createAdminClient()

  const { data } = await admin
    .from('empresas')
    .select('nombre, profiles!inner(telegram_id)')
    .eq('id', empresaId)
    .single()

  const profiles = data?.profiles as unknown as { telegram_id: number | null } | null
  const telegramId = profiles?.telegram_id
  if (!telegramId) return

  const confianzaPct = Math.round(resumen.confianza * 100)

  // NUNCA incluir RUC emisor ni razón social del proveedor
  const msg =
    `📢 <b>Nuevo documento procesado</b>\n\n` +
    `🏢 <b>${data?.nombre}</b>\n` +
    `📄 Tipo: ${resumen.tipo}\n` +
    `💰 Total: ${resumen.total ? `S/ ${resumen.total.toFixed(2)}` : 'No detectado'}\n` +
    `📂 Cuenta: <code>${resumen.cuenta}</code> — ${resumen.nombre_cuenta}\n` +
    `🎯 Confianza IA: ${confianzaPct}%\n\n` +
    `👉 <a href="${process.env.NEXT_PUBLIC_APP_URL}/documentos">Revisar en dashboard</a>`

  await sendTelegramMessage(telegramId, msg)
}
