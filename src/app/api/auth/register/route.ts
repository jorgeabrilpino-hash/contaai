import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Verificar que el usuario está autenticado
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (!user || authError) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Leer el nombre del body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { nombre } = body as { nombre?: string }

  // 3. Crear/actualizar perfil con admin client (service role, bypasa RLS)
  const admin = createAdminClient()
  const { error: profileError } = await admin
    .from('profiles')
    .upsert(
      { id: user.id, nombre: nombre?.trim() ?? '' },
      { onConflict: 'id' }
    )

  if (profileError) {
    return NextResponse.json(
      { error: `Error al crear perfil: ${profileError.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
