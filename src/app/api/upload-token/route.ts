import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let body: { empresa_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { empresa_id } = body
  if (!empresa_id) {
    return NextResponse.json({ error: 'Falta empresa_id' }, { status: 400 })
  }

  // Validate empresa belongs to user
  const { data: empresa, error: empresaError } = await supabase
    .from('empresas')
    .select('id, nombre')
    .eq('id', empresa_id)
    .eq('user_id', user.id)
    .single()

  if (!empresa || empresaError) {
    return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 403 })
  }

  const admin = createAdminClient()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
  // Generar token en la app — no depender del DEFAULT de la BD
  const token = crypto.randomUUID()

  const { data: tokenData, error: tokenError } = await admin
    .from('upload_tokens')
    .insert({
      token,
      empresa_id: empresa_id,
      user_id: user.id,
      expires_at: expiresAt.toISOString(),
      usado: false,
    })
    .select('token')
    .single()

  if (!tokenData || tokenError) {
    console.error('[upload-token] Insert error:', tokenError?.message, tokenError?.details)
    return NextResponse.json({ error: 'Error al crear el token' }, { status: 500 })
  }

  return NextResponse.json({
    token: tokenData.token,
    url: `${process.env.NEXT_PUBLIC_APP_URL}/upload/${tokenData.token}`,
    expires_at: expiresAt.toISOString(),
    empresa_nombre: empresa.nombre,
  })
}
