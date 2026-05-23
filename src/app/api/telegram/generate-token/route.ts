import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(): Promise<NextResponse> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const token = Math.random().toString(36).slice(2, 8).toUpperCase()

  // upsert con admin client: crea el perfil si no existe, actualiza si existe
  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .upsert(
      { id: user.id, telegram_token: token },
      { onConflict: 'id' }
    )

  if (error) {
    return NextResponse.json({ error: `Error al generar el token: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({ token })
}
