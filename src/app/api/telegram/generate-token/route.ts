import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Código corto criptográficamente seguro (6 chars, sin ambiguos 0/O/1/I)
function generateLinkCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('')
}

export async function POST(): Promise<NextResponse> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Si ya hay un código activo, reutilizarlo — evita acumular códigos
  // distintos cada vez que el usuario entra a /config
  const { data: existing } = await admin
    .from('profiles')
    .select('telegram_token, telegram_id')
    .eq('id', user.id)
    .single()

  if (existing?.telegram_id) {
    return NextResponse.json({ error: 'Tu cuenta ya está vinculada' }, { status: 400 })
  }

  if (existing?.telegram_token) {
    return NextResponse.json({ token: existing.telegram_token, reused: true })
  }

  const token = generateLinkCode()

  // upsert con admin client: crea el perfil si no existe, actualiza si existe
  const { error } = await admin
    .from('profiles')
    .upsert(
      { id: user.id, telegram_token: token },
      { onConflict: 'id' }
    )

  if (error) {
    return NextResponse.json({ error: `Error al generar el token: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({ token, reused: false })
}
