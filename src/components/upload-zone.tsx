'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ClasificacionResult } from './clasificacion-result'
import type { DocumentProcessResult } from '@/types'

const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

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
  const [resultado, setResultado] = useState<DocumentProcessResult | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setUploadState('idle')
    setError(null)
    setPreview(null)
    setResultado(null)
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
          setError(errData.error ?? 'Error al procesar el documento.')
          return
        }

        setResultado(data as DocumentProcessResult)
        setUploadState('success')
      } catch {
        setUploadState('error')
        setError('Error de conexión. Verifica tu conexión a internet.')
      }
    },
    [empresaId, token]
  )

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

  // Estado: success → mostrar resultado
  if (uploadState === 'success' && resultado) {
    return (
      <ClasificacionResult
        resultado={resultado}
        onConfirmed={() => {
          reset()
          onConfirmed?.()
        }}
        onCancel={reset}
      />
    )
  }

  // Estado: uploading
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
          <p className="font-semibold text-sm animate-pulse">
            🤖 Gemma 4 analizando tu documento...
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
