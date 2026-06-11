'use client'

import { useState, useRef, useCallback } from 'react'
import {
  Upload,
  FileText,
  CheckCircle,
  RefreshCw,
  Sparkles,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PCGE_CUENTAS } from '@/lib/pcge'
import type { Documento } from '@/types'

const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]

type UploadState = 'idle' | 'uploading' | 'review' | 'success' | 'error'

interface ProcessResponse {
  documento: Documento
  ocr: boolean
  alerta: string | null
}

interface UploadZoneProps {
  empresaId: string
  token?: string
  onConfirmed?: () => void
}

function validateFile(file: File): string | null {
  if (file.size > MAX_SIZE) return 'El archivo supera el límite de 5MB'
  if (!ALLOWED_TYPES.includes(file.type))
    return 'Formato no permitido. Use JPG, PNG o PDF'
  return null
}

export function UploadZone({ empresaId, token, onConfirmed }: UploadZoneProps) {
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [result, setResult] = useState<ProcessResponse | null>(null)
  const [cuentaEditada, setCuentaEditada] = useState<string>('')
  const [confirming, setConfirming] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setUploadState('idle')
    setError(null)
    setPreview(null)
    setResult(null)
    setCuentaEditada('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const processFile = useCallback(
    async (file: File) => {
      const validationError = validateFile(file)
      if (validationError) {
        setUploadState('error')
        setError(validationError)
        return
      }

      if (file.type.startsWith('image/')) {
        setPreview(URL.createObjectURL(file))
      } else {
        setPreview(null)
      }

      setUploadState('uploading')
      setError(null)

      const formData = new FormData()
      formData.append('file', file)
      formData.append('empresa_id', empresaId)
      if (token) formData.append('token', token)

      try {
        const res = await fetch('/api/documents/process', {
          method: 'POST',
          body: formData,
        })
        const data: unknown = await res.json()

        if (!res.ok) {
          const errData = data as { error?: string }
          setUploadState('error')
          setError(errData.error ?? 'Error al subir el documento.')
          return
        }

        const processed = data as ProcessResponse
        setResult(processed)
        setCuentaEditada(processed.documento.cuenta_pcge ?? '')

        // Con OCR y en el dashboard → pantalla de revisión/confirmación.
        // Upload público con token (cliente externo) → solo confirmación simple.
        if (processed.ocr && !token) {
          setUploadState('review')
        } else {
          setUploadState('success')
        }
      } catch {
        setUploadState('error')
        setError('Error de conexión. Verifica tu conexión a internet.')
      }
    },
    [empresaId, token]
  )

  async function handleConfirm() {
    if (!result || !cuentaEditada) return
    setConfirming(true)
    try {
      const res = await fetch('/api/documents/confirm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documento_id: result.documento.id,
          cuenta_pcge: cuentaEditada,
        }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setError(data.error ?? 'Error al confirmar.')
        setConfirming(false)
        return
      }
      setUploadState('success')
    } catch {
      setError('Error de conexión al confirmar.')
    }
    setConfirming(false)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave() {
    setIsDragging(false)
  }

  // Estado: review — Gemma 4 extrajo datos, el contador revisa y confirma
  if (uploadState === 'review' && result) {
    const doc = result.documento
    const confianzaPct =
      doc.confianza_ia !== null ? Math.round(doc.confianza_ia * 100) : null

    return (
      <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary shrink-0" />
          <p className="font-semibold text-sm">Gemma 4 analizó tu comprobante</p>
          {confianzaPct !== null && (
            <Badge
              variant="secondary"
              className={
                confianzaPct >= 85
                  ? 'text-green-700 bg-green-100'
                  : confianzaPct >= 60
                    ? 'text-amber-700 bg-amber-100'
                    : 'text-red-700 bg-red-100'
              }
            >
              {confianzaPct}% confianza
            </Badge>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Comprobante"
              className="max-h-40 sm:max-h-48 rounded-md object-contain border self-center sm:self-start"
            />
          )}
          <dl className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Tipo</dt>
            <dd className="font-medium capitalize">{doc.tipo}</dd>
            <dt className="text-muted-foreground">Emisor</dt>
            <dd className="font-medium truncate">{doc.razon_social ?? '—'}</dd>
            <dt className="text-muted-foreground">RUC</dt>
            <dd className="font-mono text-xs pt-0.5">{doc.ruc_emisor ?? '—'}</dd>
            <dt className="text-muted-foreground">Fecha</dt>
            <dd>{doc.fecha_emision ?? '—'}</dd>
            <dt className="text-muted-foreground">Base</dt>
            <dd className="tabular-nums">
              {doc.monto_base !== null ? `S/ ${doc.monto_base.toFixed(2)}` : '—'}
            </dd>
            <dt className="text-muted-foreground">IGV</dt>
            <dd className="tabular-nums">
              {doc.igv !== null ? `S/ ${doc.igv.toFixed(2)}` : '—'}
            </dd>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-semibold tabular-nums">
              {doc.total !== null ? `S/ ${doc.total.toFixed(2)}` : '—'}
            </dd>
            <dt className="text-muted-foreground">Deducible</dt>
            <dd>
              {doc.es_deducible === null ? (
                '—'
              ) : doc.es_deducible ? (
                <Badge className="bg-green-100 text-green-800 border-green-200" variant="outline">
                  Sí
                </Badge>
              ) : (
                <Badge className="bg-red-100 text-red-800 border-red-200" variant="outline">
                  No
                </Badge>
              )}
            </dd>
          </dl>
        </div>

        {result.alerta && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">{result.alerta}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Cuenta PCGE sugerida (puedes cambiarla)
          </p>
          <Select value={cuentaEditada} onValueChange={setCuentaEditada}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona una cuenta" />
            </SelectTrigger>
            <SelectContent>
              {/* Si la cuenta sugerida no está en el catálogo, mostrarla igual */}
              {cuentaEditada &&
                !PCGE_CUENTAS.some((c) => c.codigo === cuentaEditada) && (
                  <SelectItem value={cuentaEditada}>
                    {cuentaEditada} — {doc.nombre_cuenta ?? 'Sugerida por IA'}
                  </SelectItem>
                )}
              {PCGE_CUENTAS.map((c) => (
                <SelectItem key={c.codigo} value={c.codigo}>
                  {c.codigo} — {c.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <Button
            variant="outline"
            onClick={() => {
              reset()
              onConfirmed?.()
            }}
          >
            Dejar pendiente
          </Button>
          <Button onClick={handleConfirm} disabled={confirming || !cuentaEditada}>
            <CheckCircle className="h-4 w-4 mr-2" />
            {confirming ? 'Confirmando...' : 'Confirmar clasificación'}
          </Button>
        </div>
      </div>
    )
  }

  // Estado: success
  if (uploadState === 'success') {
    const sinOCR = result !== null && !result.ocr
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 px-6 rounded-xl border-2 border-dashed border-green-500/40 bg-green-500/5">
        <div className="rounded-full bg-green-100 p-4">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-sm text-green-700">
            {token ? 'Documento recibido' : 'Documento guardado'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {token
              ? 'El contador lo revisará y clasificará.'
              : sinOCR
                ? 'La IA no pudo procesarlo en este momento; los datos se extraerán al exportar a Excel.'
                : 'Clasificación registrada correctamente.'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            reset()
            onConfirmed?.()
          }}
          className="gap-2"
        >
          <Upload className="h-4 w-4" />
          Subir otro documento
        </Button>
      </div>
    )
  }

  // Estado: uploading (subida + análisis de Gemma 4 en una sola llamada)
  if (uploadState === 'uploading') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 px-6 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5">
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Preview"
            className="max-h-32 rounded-md object-contain opacity-60"
          />
        )}
        {!preview && <FileText className="h-12 w-12 text-primary/40 animate-pulse" />}
        <div className="text-center">
          <p className="font-semibold text-sm animate-pulse flex items-center gap-2 justify-center">
            <Sparkles className="h-4 w-4" />
            Gemma 4 analizando tu comprobante...
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Extrayendo datos y clasificando la cuenta contable
          </p>
        </div>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-2 w-2 rounded-full bg-primary animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    )
  }

  // Estado: error
  if (uploadState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 px-6 rounded-xl border-2 border-dashed border-destructive/40 bg-destructive/5">
        <p className="text-sm text-destructive font-medium text-center">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={reset}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </Button>
      </div>
    )
  }

  // Estado: idle
  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`relative rounded-xl border-2 border-dashed transition-colors cursor-pointer ${
        isDragging
          ? 'border-primary bg-primary/10'
          : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
      }`}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={handleFileChange}
      />
      <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center">
        <div
          className={`rounded-full p-4 ${isDragging ? 'bg-primary/20' : 'bg-muted'}`}
        >
          <Upload
            className={`h-8 w-8 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`}
          />
        </div>
        <div>
          <p className="font-semibold text-sm">
            {isDragging ? 'Suelta el archivo aquí' : 'Arrastra tu factura o boleta'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            o haz clic para seleccionar
          </p>
        </div>
        <p className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
          PDF, JPG, PNG — máx 5 MB
        </p>
      </div>
    </div>
  )
}
