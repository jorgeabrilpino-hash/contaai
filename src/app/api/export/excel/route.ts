import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractInvoiceData, classifyPCGE } from '@/lib/gemma'

function mimeTypeFromPath(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return null // PDF or unknown — not processable by vision models
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()

  // 1. Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Query params
  const { searchParams } = req.nextUrl
  const periodo = searchParams.get('periodo')
  const empresaIdParam = searchParams.get('empresa_id')

  if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
    return NextResponse.json(
      { error: 'Parámetro periodo requerido (formato YYYY-MM)' },
      { status: 400 }
    )
  }

  // 3. Obtener empresa con rubro y regimen (necesarios para classifyPCGE)
  let empresa: {
    id: string
    nombre: string
    ruc: string | null
    rubro: string
    regimen: string
  } | null = null

  if (empresaIdParam) {
    const { data } = await supabase
      .from('empresas')
      .select('id, nombre, ruc, rubro, regimen')
      .eq('id', empresaIdParam)
      .eq('user_id', user.id)
      .single()
    empresa = data
  }

  if (!empresa) {
    const { data } = await supabase
      .from('empresas')
      .select('id, nombre, ruc, rubro, regimen')
      .eq('user_id', user.id)
      .order('created_at')
      .limit(1)
      .single()
    empresa = data
  }

  if (!empresa) {
    return NextResponse.json({ error: 'No tienes empresas registradas' }, { status: 404 })
  }

  const admin = createAdminClient()

  // 4. Todos los documentos del período (no solo confirmados)
  const { data: rawDocs, error: docsError } = await admin
    .from('documentos')
    .select(
      'id, tipo, periodo, ruc_emisor, razon_social, fecha_emision, monto_base, igv, total, cuenta_pcge, nombre_cuenta, es_deducible, descripcion_ia, confianza_ia, estado, storage_path'
    )
    .eq('empresa_id', empresa.id)
    .eq('periodo', periodo)
    .order('fecha_emision')

  if (docsError) {
    return NextResponse.json({ error: 'Error al obtener documentos' }, { status: 500 })
  }

  // 5. Procesar con IA los documentos sin datos extraídos
  type DocRow = NonNullable<typeof rawDocs>[number]
  const documentos: DocRow[] = [...(rawDocs ?? [])]

  for (let i = 0; i < documentos.length; i++) {
    const doc = documentos[i]
    if (doc.ruc_emisor !== null) continue // ya tiene datos de IA
    if (!doc.storage_path) continue

    const mimeType = mimeTypeFromPath(doc.storage_path)
    if (!mimeType) continue // PDF — no procesable con visión

    try {
      const { data: fileData, error: downloadError } = await admin.storage
        .from('documentos')
        .download(doc.storage_path)

      if (downloadError || !fileData) continue

      const buffer = Buffer.from(await fileData.arrayBuffer())
      const base64 = buffer.toString('base64')

      const extraccion = await extractInvoiceData(base64, mimeType)
      const descripcion = extraccion.descripcion ?? 'Comprobante sin descripción'
      const clasificacion = await classifyPCGE(descripcion, empresa.rubro, empresa.regimen)

      const nuevoEstado: 'revisado' | 'pendiente' =
        clasificacion.confianza >= 0.85 ? 'revisado' : 'pendiente'

      const updates = {
        tipo: (extraccion.tipo ?? doc.tipo) as 'factura' | 'boleta',
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
        estado: nuevoEstado,
      }

      await admin.from('documentos').update(updates).eq('id', doc.id)
      documentos[i] = { ...doc, ...updates }
    } catch {
      // AI falló para este documento — se exporta con datos vacíos
    }
  }

  // 6. Construir workbook
  const wb = XLSX.utils.book_new()

  // ── Hoja 1: Registro de Compras ────────────────────────────────────────
  const registroHeaders = [
    'Período',
    'Tipo',
    'Fecha Emisión',
    'RUC Emisor',
    'Razón Social',
    'Base Imponible',
    'IGV',
    'Total',
    'Cuenta PCGE',
    'Nombre Cuenta',
    'Deducible',
    'Estado',
  ]

  const registroRows = documentos.map((doc) => [
    doc.periodo ?? '',
    doc.tipo ?? '',
    formatDate(doc.fecha_emision),
    doc.ruc_emisor ?? '',
    doc.razon_social ?? '',
    doc.monto_base ?? 0,
    doc.igv ?? 0,
    doc.total ?? 0,
    doc.cuenta_pcge ?? '',
    doc.nombre_cuenta ?? '',
    doc.es_deducible ? 'Sí' : 'No',
    doc.estado ?? '',
  ])

  const ws1 = XLSX.utils.aoa_to_sheet([registroHeaders, ...registroRows])
  ws1['!cols'] = [
    { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 30 },
    { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 10 }, { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, ws1, 'Registro de Compras')

  // ── Hoja 2: Resumen por Cuenta ─────────────────────────────────────────
  const porCuenta = documentos.reduce<
    Record<string, { nombre: string | null; count: number; base: number; igv: number }>
  >((acc, doc) => {
    const key = doc.cuenta_pcge ?? 'sin-clasificar'
    if (!acc[key]) acc[key] = { nombre: doc.nombre_cuenta, count: 0, base: 0, igv: 0 }
    acc[key].count++
    acc[key].base += doc.monto_base ?? 0
    acc[key].igv += doc.igv ?? 0
    return acc
  }, {})

  const totalBase = documentos.reduce((s, d) => s + (d.monto_base ?? 0), 0)
  const totalIGV = documentos.reduce((s, d) => s + (d.igv ?? 0), 0)
  const totalDocs = documentos.length

  const resumenHeaders = ['Cuenta PCGE', 'Nombre Cuenta', 'N Docs', 'Base Total', 'IGV Total']
  const resumenRows = Object.entries(porCuenta)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cuenta, vals]) => [cuenta, vals.nombre ?? '', vals.count, vals.base, vals.igv])

  resumenRows.push(['TOTAL', '', totalDocs, totalBase, totalIGV])

  const ws2 = XLSX.utils.aoa_to_sheet([resumenHeaders, ...resumenRows])
  ws2['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 8 }, { wch: 16 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Resumen por Cuenta')

  // ── Hoja 3: Información ────────────────────────────────────────────────
  const hoy = new Date()
  const fechaGeneracion = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`

  const ws3 = XLSX.utils.aoa_to_sheet([
    ['Campo', 'Valor'],
    ['Empresa', empresa.nombre],
    ['RUC', empresa.ruc ?? '—'],
    ['Período', periodo],
    ['Total documentos', totalDocs],
    ['Total IGV', `S/ ${totalIGV.toFixed(2)}`],
    ['Total Base Imponible', `S/ ${totalBase.toFixed(2)}`],
    ['Generado por', 'ContaAI con Gemma 4'],
    ['Fecha de generación', fechaGeneracion],
  ])
  ws3['!cols'] = [{ wch: 22 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'Información')

  // 7. Generar blob y responder
  const uint8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
  const blob = new Blob([uint8.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  const empresaSanitized = sanitizeFilename(empresa.nombre)
  const filename = `contaai-${empresaSanitized}-${periodo}.xlsx`

  return new NextResponse(blob, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
