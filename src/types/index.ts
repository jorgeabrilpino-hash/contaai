// ─────────────────────────────────────────────
// Tipos del dominio ContaAI
// ─────────────────────────────────────────────

export type Profile = {
  id: string
  nombre: string | null
  telegram_id: number | null
  telegram_token: string | null
  created_at: string
}

export type Empresa = {
  id: string
  user_id: string
  nombre: string
  ruc: string | null
  rubro: string
  regimen: 'RMT' | 'RER' | 'RG' | 'NRUS'
  tipo_contrato: 'emese' | 'fijo'
  created_at: string
}

export type DocumentoEstado = 'pendiente' | 'revisado' | 'confirmado'

export type Documento = {
  id: string
  empresa_id: string
  tipo: 'factura' | 'boleta'
  storage_path: string | null
  ruc_emisor: string | null
  razon_social: string | null
  fecha_emision: string | null         // ISO date: 'YYYY-MM-DD'
  monto_base: number | null
  igv: number | null
  total: number | null
  cuenta_pcge: string | null           // ej: '60.1'
  nombre_cuenta: string | null
  descripcion_ia: string | null
  es_deducible: boolean | null
  confianza_ia: number | null          // 0.0 a 1.0
  estado: DocumentoEstado
  periodo: string | null               // 'YYYY-MM'
  created_at: string
}

export type UploadToken = {
  token: string
  empresa_id: string
  user_id: string
  expires_at: string
  usado: boolean
  created_at: string
}

// ─────────────────────────────────────────────
// Tipos de respuesta de la API
// ─────────────────────────────────────────────

export type ApiError = {
  error: string
  details?: string
}

export type ApiSuccess<T> = {
  data: T
}

// ─────────────────────────────────────────────
// Tipos de Gemma 4
// ─────────────────────────────────────────────

export type InvoiceExtraction = {
  tipo: 'factura' | 'boleta' | null
  serie_numero: string | null
  ruc_emisor: string | null
  razon_social: string | null
  fecha_emision: string | null
  monto_base: number | null
  igv: number | null
  total: number | null
  descripcion: string | null
}

export type PCGEClassification = {
  cuenta_pcge: string
  nombre_cuenta: string
  es_deducible: boolean
  razon: string
  confianza: number
  alerta: string | null
}

export type DocumentProcessResult = {
  documento: Documento
}

// ─────────────────────────────────────────────
// Tipos del Bot de Telegram
// ─────────────────────────────────────────────

export type BotIntent =
  | 'upload'
  | 'query_igv'
  | 'query_vencimiento'
  | 'query_facturas'
  | 'unknown'

// ─────────────────────────────────────────────
// Tipos de Reportes
// ─────────────────────────────────────────────

export type ResumenPCGE = {
  cuenta_pcge: string
  nombre_cuenta: string | null
  total_base: number
  total_igv: number
  count: number
}

export type ResumenMensual = {
  periodo: string
  total_igv: number
  total_base: number
  total_docs: number
  confirmados: number
  pendientes: number
  por_cuenta: ResumenPCGE[]
}