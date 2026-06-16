'use client'

import { useState, useRef, useCallback } from 'react'
import {
  Upload,
  FileText,
  CheckCircle,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  X,
  Loader2,
  ImageIcon,
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
const MAX_FILES = 5
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]

interface ProcessResponse {
  documento: Documento
  ocr: boolean
  alerta: string | null
}

type FileItemState = 'pending' | 'uploading' | 'review' | 'confirmed' | 'error'

interface FileItem {
  id: string
  file: File
  preview: string | null
  state: FileItemState
  result: ProcessResponse | null
  error: string | null
  cuenta: string
  confirming: boolean
}

interface UploadZoneProps {
  empresaId: string
  token?: string
  onConfirmed?: () => void
}

function validateFile(file: File): string | null {
  if (file.size > MAX_SIZE) return `"${file.name}" supera el límite de 5 MB`
  if (!ALLOWED_TYPES.includes(file.type))
    return `"${file.name}": formato no permitido. Use JPG, PNG, WebP o PDF`
  return null
}

function FileRow({
  item,
  isActive,
  onEdit,
  onConfirm,
}: {
  item: FileItem
  isActive: boolean
  onEdit: (id: string, cuenta: string) => void
  onConfirm: (id: string) => void
}) {
  const doc = item.result?.documento
  const confianzaPct = doc?.confianza_ia !== null && doc?.confianza_ia !== undefined
    ? Math.round(doc.confianza_ia * 100)
    : null

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 transition-colors ${
        isActive ? 'border-primary/50 bg-primary/5' : 'bg-card'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 text-sm">
        {item.state === 'uploading' ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
        ) : item.state === 'confirmed' ? (
          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
        ) : item.state === 'error' ? (
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        ) : item.state === 'review' ? (
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
        ) : (
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <span className="font-medium truncate flex-1">{item.file.name}</span>
        {confianzaPct !== null && item.state !== 'confirmed' && (
          <Badge
            variant="secondary"
            className={
              confianzaPct >= 85
                ? 'text-green-700 bg-green-100 shrink-0'
                : confianzaPct >= 60
                  ? 'text-amber-700 bg-amber-100 shrink-0'
                  : 'text-red-700 bg-red-100 shrink-0'
            }
          >
            {confianzaPct}%
          </Badge>
        )}
      </div>

      {/* Estado: subiendo */}
      {item.state === 'uploading' && (
        <p className="text-xs text-muted-foreground animate-pulse pl-6">
          Gemma 4 analizando comprobante...
        </p>
      )}

      {/* Estado: error */}
      {item.state === 'error' && (
        <p className="text-xs text-destructive pl-6">{item.error}</p>
      )}

      {/* Estado: revisión */}
      {item.state === 'review' && doc && (
        <div className="pl-6 space-y-3">
          <div className="flex gap-4">
            {item.preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.preview}
                alt="Comprobante"
                className="max-h-24 rounded-md object-contain border shrink-0"
              />
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs flex-1">
              <dt className="text-muted-foreground">Tipo</dt>
              <dd className="font-medium capitalize">{doc.tipo}</dd>
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
              <dt className="text-muted-foreground">Fecha</dt>
              <dd>{doc.fecha_emision ?? '—'}</dd>
              <dt className="text-muted-foreground">Deducible</dt>
              <dd>
                {doc.es_deducible === null
                  ? '—'
                  : doc.es_deducible
                    ? <span className="text-green-700 font-medium">Sí</span>
                    : <span className="text-red-600 font-medium">No</span>}
              </dd>
            </dl>
          </div>

          {item.result?.alerta && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">{item.result.alerta}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Cuenta PCGE sugerida
            </p>
            <Select value={item.cuenta} onValueChange={(v) => onEdit(item.id, v)}>
              <SelectTrigger className="h-8 text-xs w-full">
                <SelectValue placeholder="Selecciona cuenta" />
              </SelectTrigger>
              <SelectContent>
                {item.cuenta && !PCGE_CUENTAS.some((c) => c.codigo === item.cuenta) && (
                  <SelectItem value={item.cuenta}>
                    {item.cuenta} — {doc.nombre_cuenta ?? 'Sugerida por IA'}
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

          <Button
            size="sm"
            onClick={() => onConfirm(item.id)}
            disabled={item.confirming || !item.cuenta}
            className="gap-1.5 w-full sm:w-auto"
          >
            {item.confirming ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle className="h-3.5 w-3.5" />
            )}
            {item.confirming ? 'Confirmando...' : 'Confirmar clasificación'}
          </Button>
        </div>
      )}

      {/* Estado: confirmado */}
      {item.state === 'confirmed' && doc && (
        <p className="text-xs text-green-700 pl-6">
          Guardado · {doc.cuenta_pcge} {doc.nombre_cuenta ? `— ${doc.nombre_cuenta}` : ''} ·{' '}
          {doc.total !== null ? `S/ ${doc.total.toFixed(2)}` : ''}
        </p>
      )}
    </div>
  )
}

export function UploadZone({ empresaId, token, onConfirmed }: UploadZoneProps) {
  const [queue, setQueue] = useState<FileItem[]>([])
  const [processing, setProcessing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const processingRef = useRef(false)

  const allDone =
    queue.length > 0 &&
    queue.every((f) => f.state === 'confirmed' || f.state === 'error')

  const pendingReview = queue.filter((f) => f.state === 'review').length
  const confirmed = queue.filter((f) => f.state === 'confirmed').length
  const currentIdx = queue.findIndex((f) => f.state === 'uploading')

  function reset() {
    setQueue([])
    setProcessing(false)
    setGlobalError(null)
    processingRef.current = false
    if (inputRef.current) inputRef.current.value = ''
  }

  const processQueue = useCallback(
    async (items: FileItem[]) => {
      if (processingRef.current) return
      processingRef.current = true
      setProcessing(true)

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.state !== 'pending') continue

        // Marcar como subiendo
        setQueue((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, state: 'uploading' } : f))
        )

        const formData = new FormData()
        formData.append('file', item.file)
        formData.append('empresa_id', empresaId)
        if (token) formData.append('token', token)

        try {
          const res = await fetch('/api/documents/process', {
            method: 'POST',
            body: formData,
          })
          const data = (await res.json()) as ProcessResponse & { error?: string }

          if (!res.ok) {
            setQueue((prev) =>
              prev.map((f) =>
                f.id === item.id
                  ? { ...f, state: 'error', error: data.error ?? 'Error al subir' }
                  : f
              )
            )
          } else {
            const nextState: FileItemState =
              data.ocr && !token ? 'review' : 'confirmed'
            setQueue((prev) =>
              prev.map((f) =>
                f.id === item.id
                  ? {
                      ...f,
                      state: nextState,
                      result: data,
                      cuenta: data.documento.cuenta_pcge ?? '',
                    }
                  : f
              )
            )
          }
        } catch {
          setQueue((prev) =>
            prev.map((f) =>
              f.id === item.id
                ? { ...f, state: 'error', error: 'Error de conexión.' }
                : f
            )
          )
        }
      }

      processingRef.current = false
      setProcessing(false)
    },
    [empresaId, token]
  )

  async function handleConfirm(id: string) {
    const item = queue.find((f) => f.id === id)
    if (!item?.result) return

    setQueue((prev) =>
      prev.map((f) => (f.id === id ? { ...f, confirming: true } : f))
    )

    try {
      const res = await fetch('/api/documents/confirm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documento_id: item.result.documento.id,
          cuenta_pcge: item.cuenta,
        }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setQueue((prev) =>
          prev.map((f) =>
            f.id === id
              ? { ...f, state: 'error', error: data.error ?? 'Error al confirmar.', confirming: false }
              : f
          )
        )
      } else {
        setQueue((prev) =>
          prev.map((f) =>
            f.id === id ? { ...f, state: 'confirmed', confirming: false } : f
          )
        )
        onConfirmed?.()
      }
    } catch {
      setQueue((prev) =>
        prev.map((f) =>
          f.id === id
            ? { ...f, state: 'error', error: 'Error de conexión.', confirming: false }
            : f
        )
      )
    }
  }

  function editCuenta(id: string, cuenta: string) {
    setQueue((prev) =>
      prev.map((f) => (f.id === id ? { ...f, cuenta } : f))
    )
  }

  function addFiles(files: File[]) {
    setGlobalError(null)

    const slots = MAX_FILES - queue.length
    if (slots <= 0) {
      setGlobalError(`Máximo ${MAX_FILES} archivos por lote. Confirma los actuales primero.`)
      return
    }

    const toAdd = files.slice(0, slots)
    const errors: string[] = []
    const valid: FileItem[] = []

    for (const file of toAdd) {
      const err = validateFile(file)
      if (err) {
        errors.push(err)
      } else {
        valid.push({
          id: crypto.randomUUID(),
          file,
          preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
          state: 'pending',
          result: null,
          error: null,
          cuenta: '',
          confirming: false,
        })
      }
    }

    if (errors.length > 0) {
      setGlobalError(errors.join(' · '))
    }

    if (valid.length > 0) {
      const updated = [...queue, ...valid]
      setQueue(updated)
      processQueue(updated)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) addFiles(files)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) addFiles(files)
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave() {
    setIsDragging(false)
  }

  // Vista: cola con archivos
  if (queue.length > 0) {
    const total = queue.length
    const done = queue.filter((f) => f.state === 'confirmed' || f.state === 'error').length

    return (
      <div className="space-y-3">
        {/* Header de progreso */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="font-medium">
                  Procesando {currentIdx >= 0 ? currentIdx + 1 : done} de {total}...
                </span>
              </>
            ) : allDone ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="font-medium">
                  {confirmed} de {total} {confirmed === 1 ? 'confirmado' : 'confirmados'}
                </span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-medium">
                  {pendingReview} {pendingReview === 1 ? 'listo para revisar' : 'listos para revisar'}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!processing && queue.length < MAX_FILES && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
                className="gap-1.5 text-xs"
              >
                <Upload className="h-3.5 w-3.5" />
                Agregar ({MAX_FILES - queue.length} más)
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="gap-1.5 text-xs text-muted-foreground"
              title="Limpiar todo"
            >
              <X className="h-3.5 w-3.5" />
              Limpiar
            </Button>
          </div>
        </div>

        {/* Barra de progreso */}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>

        {/* Lista de archivos */}
        <div className="space-y-2">
          {queue.map((item, idx) => (
            <FileRow
              key={item.id}
              item={item}
              isActive={item.state === 'uploading'}
              onEdit={editCuenta}
              onConfirm={handleConfirm}
            />
          ))}
        </div>

        {globalError && (
          <p className="text-sm text-destructive">{globalError}</p>
        )}

        {/* Input oculto para agregar más */}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          onChange={handleFileChange}
        />

        {/* Éxito total */}
        {allDone && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                reset()
                onConfirmed?.()
              }}
              className="gap-2"
            >
              <Upload className="h-3.5 w-3.5" />
              Subir más documentos
            </Button>
          </div>
        )}
      </div>
    )
  }

  // Vista: drop zone vacía
  return (
    <div className="space-y-2">
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
          multiple
          onChange={handleFileChange}
        />
        <div className="flex flex-col items-center justify-center gap-3 py-10 px-6 text-center">
          <div className={`rounded-full p-4 ${isDragging ? 'bg-primary/20' : 'bg-muted'}`}>
            {isDragging ? (
              <Upload className="h-8 w-8 text-primary" />
            ) : (
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <div>
            <p className="font-semibold text-sm">
              {isDragging ? 'Suelta los archivos aquí' : 'Arrastra tus facturas o boletas'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              o haz clic para seleccionar
            </p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
              JPG, PNG, WebP, PDF · máx 5 MB por archivo
            </p>
            <p className="text-xs text-muted-foreground">
              Puedes subir hasta <strong>{MAX_FILES} archivos</strong> a la vez
            </p>
          </div>
        </div>
      </div>

      {globalError && (
        <p className="text-sm text-destructive">{globalError}</p>
      )}
    </div>
  )
}
