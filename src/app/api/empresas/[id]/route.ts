import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PUT(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const { id } = await context.params
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (!user || authError) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { nombre, ruc, rubro, regimen, tipo_contrato } = body as Record<
    string,
    string
  >

  if (!nombre?.trim() || !rubro?.trim()) {
    return NextResponse.json(
      { error: 'Nombre y rubro son requeridos' },
      { status: 400 }
    )
  }

  if (ruc && !/^\d{11}$/.test(ruc)) {
    return NextResponse.json(
      { error: 'El RUC debe tener exactamente 11 dígitos' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('empresas')
    .update({
      nombre: nombre.trim(),
      ruc: ruc?.trim() || null,
      rubro: rubro.trim(),
      regimen: regimen || 'RMT',
      tipo_contrato: tipo_contrato || 'emese',
    })
    .eq('id', id)
    .eq('user_id', user.id) // CRÍTICO: validar pertenencia
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Empresa no encontrada o sin permisos' },
      { status: 403 }
    )
  }

  return NextResponse.json({ data })
}

export async function DELETE(
  _req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const { id } = await context.params
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (!user || authError) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Verificar que la empresa pertenece al usuario antes de todo
  const { data: empresa } = await supabase
    .from('empresas')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!empresa) {
    return NextResponse.json(
      { error: 'Empresa no encontrada o sin permisos' },
      { status: 403 }
    )
  }

  // No eliminar si tiene documentos asociados
  const { count } = await supabase
    .from('documentos')
    .select('*', { count: 'exact', head: true })
    .eq('empresa_id', id)

  if (count && count > 0) {
    return NextResponse.json(
      {
        error: `No se puede eliminar: tiene ${count} documento${count > 1 ? 's' : ''} asociado${count > 1 ? 's' : ''}`,
      },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('empresas')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id) // CRÍTICO: doble validación

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
