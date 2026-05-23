import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PCGE_CUENTAS } from '@/lib/pcge'

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()

  // 1. Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Parse body — accepts documento_id (frontend) or doc_id (legacy)
  let body: { documento_id?: string; doc_id?: string; cuenta_pcge?: string; nombre_cuenta?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const documentoId = body.documento_id ?? body.doc_id
  const { cuenta_pcge } = body

  if (!documentoId || !cuenta_pcge) {
    return NextResponse.json(
      { error: 'Faltan datos requeridos: documento_id y cuenta_pcge' },
      { status: 400 }
    )
  }

  // 3. Fetch document — RLS already limits to user's empresas
  const { data: doc, error: docError } = await supabase
    .from('documentos')
    .select('id, empresa_id')
    .eq('id', documentoId)
    .single()

  if (!doc || docError) {
    return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
  }

  // 4. Verify empresa belongs to user (second security layer)
  const { data: empresa, error: empresaError } = await supabase
    .from('empresas')
    .select('id')
    .eq('id', doc.empresa_id)
    .eq('user_id', user.id)
    .single()

  if (!empresa || empresaError) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  // 5. Resolve nombre_cuenta: from body if provided, else PCGE catalog lookup
  const nombre_cuenta =
    body.nombre_cuenta ??
    PCGE_CUENTAS.find((c) => c.codigo === cuenta_pcge)?.nombre ??
    null

  // 6. Confirm document
  const { data: updated, error: updateError } = await supabase
    .from('documentos')
    .update({ estado: 'confirmado', cuenta_pcge, nombre_cuenta })
    .eq('id', documentoId)
    .select()
    .single()

  if (updateError || !updated) {
    return NextResponse.json({ error: 'Error al confirmar el documento' }, { status: 500 })
  }

  return NextResponse.json({ documento: updated })
}
