import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractInvoiceData, classifyPCGE } from '@/lib/gemma'
import { notifyContador } from '@/lib/notify'

export async function POST(req: NextRequest): Promise<NextResponse> {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const tokenParam = formData.get('token') as string | null
  const empresaIdParam = formData.get('empresa_id') as string | null

  if (!file) {
    return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
  }

  const admin = createAdminClient()
  let empresaId: string
  let rubro: string
  let regimen: string

  if (tokenParam) {
    // Token path: public upload from /upload/[token] page
    const { data: tokenData, error: tokenError } = await admin
      .from('upload_tokens')
      .select('empresa_id, empresas(rubro, regimen)')
      .eq('token', tokenParam)
      .eq('usado', false)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (!tokenData || tokenError) {
      return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 403 })
    }

    empresaId = tokenData.empresa_id
    const emp = tokenData.empresas as unknown as { rubro: string; regimen: string } | null
    rubro = emp?.rubro ?? 'General'
    regimen = emp?.regimen ?? 'RMT'
  } else {
    // Auth path: authenticated user from dashboard
    if (!empresaIdParam) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos: file y empresa_id' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!user || authError) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { data: empresa, error: empresaError } = await supabase
      .from('empresas')
      .select('id, rubro, regimen')
      .eq('id', empresaIdParam)
      .eq('user_id', user.id)
      .single()

    if (!empresa || empresaError) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 403 })
    }

    empresaId = empresa.id
    rubro = empresa.rubro
    regimen = empresa.regimen
  }

  // Validate file
  const MAX_SIZE = 5 * 1024 * 1024
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'El archivo supera el límite de 5MB' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Formato no permitido. Use JPG, PNG o PDF' },
      { status: 400 }
    )
  }

  // Read bytes and upload to Storage
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const rawExt = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const ext = rawExt.replace(/[^a-z0-9]/g, '') || 'jpg'
  const storagePath = `documentos/${empresaId}/${Date.now()}.${ext}`

  const { error: uploadError } = await admin.storage
    .from('documentos')
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json(
      { error: `Error al subir el archivo: ${uploadError.message}` },
      { status: 500 }
    )
  }

  // Extract with Gemma 4 (retry once on failure)
  const base64 = buffer.toString('base64')
  let extraccion
  try {
    extraccion = await extractInvoiceData(base64, file.type)
  } catch {
    try {
      await new Promise(r => setTimeout(r, 2000))
      extraccion = await extractInvoiceData(base64, file.type)
    } catch (err) {
      await admin.storage.from('documentos').remove([storagePath])
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      return NextResponse.json(
        { error: `Error al procesar el documento con Gemma 4: ${msg}` },
        { status: 500 }
      )
    }
  }

  // Classify PCGE with Gemma 4 (retry once on failure)
  const descripcion = extraccion.descripcion ?? 'Comprobante sin descripción'
  let clasificacion
  try {
    clasificacion = await classifyPCGE(descripcion, rubro, regimen)
  } catch {
    try {
      await new Promise(r => setTimeout(r, 2000))
      clasificacion = await classifyPCGE(descripcion, rubro, regimen)
    } catch {
      clasificacion = {
        cuenta_pcge: '60.9',
        nombre_cuenta: 'Otras compras',
        es_deducible: false,
        razon: 'No se pudo clasificar automáticamente',
        confianza: 0.3,
        alerta: 'Requiere revisión manual del contador',
      }
    }
  }

  const estado = clasificacion.confianza >= 0.85 ? 'revisado' : 'pendiente'
  const periodo = extraccion.fecha_emision
    ? extraccion.fecha_emision.slice(0, 7)
    : new Date().toISOString().slice(0, 7)

  // Insert document (admin client — auth/token already validated above)
  const { data: documento, error: insertError } = await admin
    .from('documentos')
    .insert({
      empresa_id: empresaId,
      tipo: extraccion.tipo ?? 'factura',
      storage_path: storagePath,
      ruc_emisor: extraccion.ruc_emisor,
      razon_social: extraccion.razon_social,
      fecha_emision: extraccion.fecha_emision,
      monto_base: extraccion.monto_base,
      igv: extraccion.igv,
      total: extraccion.total,
      cuenta_pcge: clasificacion.cuenta_pcge,
      nombre_cuenta: clasificacion.nombre_cuenta,
      descripcion_ia: extraccion.descripcion,
      es_deducible: clasificacion.es_deducible,
      confianza_ia: clasificacion.confianza,
      estado,
      periodo,
    })
    .select()
    .single()

  if (insertError || !documento) {
    return NextResponse.json({ error: 'Error al guardar el documento' }, { status: 500 })
  }

  // Mark token as used after successful insert
  if (tokenParam) {
    await admin.from('upload_tokens').update({ usado: true }).eq('token', tokenParam)
  }

  // Notify contador via Telegram (fire and forget)
  notifyContador(empresaId, {
    tipo: documento.tipo,
    total: documento.total,
    cuenta: clasificacion.cuenta_pcge,
    nombre_cuenta: clasificacion.nombre_cuenta,
    confianza: clasificacion.confianza,
  }).catch(() => {})

  return NextResponse.json({ documento, extraccion, clasificacion })
}
