import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (!user || authError) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('empresas')
    .select('id, nombre, ruc, rubro, regimen, tipo_contrato, created_at')
    .eq('user_id', user.id)
    .order('created_at')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
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
    .insert({
      nombre: nombre.trim(),
      ruc: ruc?.trim() || null,
      rubro: rubro.trim(),
      regimen: regimen || 'RMT',
      tipo_contrato: tipo_contrato || 'emese',
      user_id: user.id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
