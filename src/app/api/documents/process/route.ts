import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractInvoiceData, classifyPCGE } from '@/lib/gemma'
import { notifyContador } from '@/lib/notify'

type EmpresaInfo = {
  id: string
  nombre: string
  rubro: string
  regimen: string
}

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
  let empresa: EmpresaInfo

  if (tokenParam) {
    // Token path: public upload from /upload/[token] page
    const { data: tokenData, error: tokenError } = await admin
      .from('upload_tokens')
      .select('empresa_id')
      .eq('token', tokenParam)
      .eq('usado', false)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (!tokenData || tokenError) {
      return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 403 })
    }

    const { data: empresaData } = await admin
      .from('empresas')
      .select('id, nombre, rubro, regimen')
      .eq('id', tokenData.empresa_id)
      .single()

    if (!empresaData) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 403 })
    }

    empresa = empresaData
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

    const { data: empresaData, error: empresaError } = await supabase
      .from('empresas')
      .select('id, nombre, rubro, regimen')
      .eq('id', empresaIdParam)
      .eq('user_id', user.id)
      .single()

    if (!empresaData || empresaError) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 403 })
    }

    empresa = empresaData
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

  // Upload to Storage
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const rawExt = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const ext = rawExt.replace(/[^a-z0-9]/g, '') || 'jpg'
  const storagePath = `documentos/${empresa.id}/${Date.now()}.${ext}`

  const { error: uploadError } = await admin.storage
    .from('documentos')
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (uploadError) {
    console.error('[process] Storage upload error:', uploadError.message)
    return NextResponse.json(
      { error: `Error al subir el archivo: ${uploadError.message}` },
      { status: 500 }
    )
  }

  // ── OCR en tiempo real con Gemma 4 ──
  // Solo imágenes (los PDF se procesan en diferido al exportar).
  // Si la IA falla, el documento se guarda igual como pendiente sin datos —
  // nunca se pierde el archivo del usuario por un fallo del modelo.
  const isImage = file.type.startsWith('image/')
  let extraccion: Awaited<ReturnType<typeof extractInvoiceData>> | null = null
  let clasificacion: Awaited<ReturnType<typeof classifyPCGE>> | null = null

  if (isImage) {
    try {
      extraccion = await extractInvoiceData(buffer.toString('base64'), file.type)
      clasificacion = await classifyPCGE(
        extraccion.descripcion ?? extraccion.razon_social ?? 'Compra sin descripción',
        empresa.rubro,
        empresa.regimen
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.slice(0, 120) : 'desconocido'
      console.warn('[process] OCR no disponible, se guarda sin datos de IA:', msg)
      extraccion = null
      clasificacion = null
    }
  }

  const { data: documento, error: insertError } = await admin
    .from('documentos')
    .insert({
      empresa_id: empresa.id,
      tipo: extraccion?.tipo ?? 'factura',
      storage_path: storagePath,
      ruc_emisor: extraccion?.ruc_emisor ?? null,
      razon_social: extraccion?.razon_social ?? null,
      fecha_emision: extraccion?.fecha_emision ?? null,
      monto_base: extraccion?.monto_base ?? null,
      igv: extraccion?.igv ?? null,
      total: extraccion?.total ?? null,
      cuenta_pcge: clasificacion?.cuenta_pcge ?? null,
      nombre_cuenta: clasificacion?.nombre_cuenta ?? null,
      descripcion_ia: extraccion?.descripcion ?? null,
      es_deducible: clasificacion?.es_deducible ?? null,
      confianza_ia: clasificacion?.confianza ?? null,
      estado: 'pendiente',
      periodo: new Date().toISOString().slice(0, 7),
    })
    .select()
    .single()

  if (insertError || !documento) {
    console.error('[process] DB insert error:', insertError?.message)
    await admin.storage.from('documentos').remove([storagePath])
    return NextResponse.json({ error: 'Error al guardar el documento' }, { status: 500 })
  }

  // Mark token as used after successful insert
  if (tokenParam) {
    await admin.from('upload_tokens').update({ usado: true }).eq('token', tokenParam)
  }

  // Notificar al contador por Telegram (best-effort, nunca rompe el upload)
  if (clasificacion) {
    try {
      await notifyContador(empresa.id, {
        tipo: extraccion?.tipo ?? 'factura',
        total: extraccion?.total ?? null,
        cuenta: clasificacion.cuenta_pcge,
        nombre_cuenta: clasificacion.nombre_cuenta,
        confianza: clasificacion.confianza,
      })
    } catch {
      // sin telegram vinculado o API caída — no es un error del upload
    }
  }

  return NextResponse.json({
    documento,
    ocr: clasificacion !== null,
    alerta: clasificacion?.alerta ?? null,
  })
}
