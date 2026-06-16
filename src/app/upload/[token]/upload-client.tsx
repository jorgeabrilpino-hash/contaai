'use client'

import { useState, useEffect, useRef } from 'react'
import { CheckCircle, Camera, FolderOpen, ImageIcon, Loader2, Sparkles, AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface UploadPublicaClientProps {
  empresaNombre: string
  expiresAt: string
  token: string
  empresaId: string
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

export function UploadPublicaClient({
  empresaNombre,
  expiresAt,
  token,
  empresaId,
}: UploadPublicaClientProps) {
  const [done, setDone] = useState(false)
  const [timeLeft, setTimeLeft] = useState('')
  const [expired, setExpired] = useState(false)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Dos inputs independientes:
  // - cameraRef: con capture="environment" → abre cámara trasera en móvil
  // - fileRef: sin capture → abre selector de archivos / galería
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function updateTimer() {
      const diff = new Date(expiresAt).getTime() - Date.now()
      if (diff <= 0) {
        setTimeLeft('Expirado')
        setExpired(true)
        return
      }
      const mins = Math.floor(diff / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`)
    }
    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  async function uploadFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      setUploadState('error')
      setErrorMsg('El archivo supera el límite de 5 MB. Elige otro.')
      return
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(file.type)) {
      setUploadState('error')
      setErrorMsg('Formato no permitido. Usa JPG, PNG, WebP o PDF.')
      return
    }

    setUploadState('uploading')
    setErrorMsg(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('empresa_id', empresaId)
    formData.append('token', token)

    try {
      const res = await fetch('/api/documents/process', { method: 'POST', body: formData })
      if (res.ok) {
        setUploadState('success')
        setDone(true)
      } else {
        const data = (await res.json()) as { error?: string }
        setUploadState('error')
        setErrorMsg(data.error ?? 'Error al enviar. Intenta de nuevo.')
      }
    } catch {
      setUploadState('error')
      setErrorMsg('Error de conexión. Verifica tu internet e intenta de nuevo.')
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void uploadFile(file)
    // Limpiar para permitir seleccionar el mismo archivo de nuevo
    e.target.value = ''
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <div className="rounded-full bg-green-100 p-4">
          <CheckCircle className="h-12 w-12 text-green-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-green-700">¡Documento recibido!</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Gemma 4 lo está analizando. El contador recibirá los datos clasificados automáticamente.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">Puedes cerrar esta ventana.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Empresa + countdown */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Para:{' '}
          <span className="font-semibold text-foreground">{empresaNombre}</span>
        </span>
        <span className={`font-mono font-bold tabular-nums text-base ${expired ? 'text-destructive' : 'text-amber-600'}`}>
          ⏱ {timeLeft}
        </span>
      </div>

      {expired ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 py-10 px-6 text-center">
          <p className="text-sm text-destructive font-medium">
            Este enlace ha expirado. Solicita uno nuevo al contador.
          </p>
        </div>
      ) : uploadState === 'uploading' ? (
        /* ── Subiendo ── */
        <div className="flex flex-col items-center gap-4 py-10 text-center rounded-xl border-2 border-dashed border-primary/30 bg-primary/5">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <div>
            <p className="font-semibold text-sm flex items-center gap-2 justify-center">
              <Sparkles className="h-4 w-4" />
              Gemma 4 analizando tu comprobante...
            </p>
            <p className="text-xs text-muted-foreground mt-1">Extrayendo datos y clasificando</p>
          </div>
        </div>
      ) : uploadState === 'error' ? (
        /* ── Error ── */
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{errorMsg}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setUploadState('idle')} className="gap-2 w-full">
            <RefreshCw className="h-4 w-4" />
            Intentar de nuevo
          </Button>
        </div>
      ) : (
        /* ── Idle: opciones de subida ── */
        <div className="space-y-4">
          {/* Inputs ocultos */}
          {/* capture="environment" abre la cámara trasera en móvil (iOS y Android) */}
          <input
            ref={cameraRef}
            type="file"
            className="hidden"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
          />
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleFileChange}
          />

          {/* Instrucción */}
          <div className="text-center space-y-1 py-2">
            <div className="flex justify-center">
              <div className="rounded-full bg-muted p-3">
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              </div>
            </div>
            <p className="font-semibold text-sm mt-2">Sube tu comprobante de pago</p>
            <p className="text-xs text-muted-foreground">Factura o boleta · JPG, PNG o PDF · máx 5 MB</p>
          </div>

          {/* Botones de acción */}
          <div className="flex flex-col gap-3">
            {/* Botón cámara — en desktop también funciona (abre webcam o file picker según el OS) */}
            <Button
              size="lg"
              className="w-full gap-3 h-14 text-base"
              onClick={() => cameraRef.current?.click()}
            >
              <Camera className="h-5 w-5" />
              Tomar foto del comprobante
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="w-full gap-3 h-12"
              onClick={() => fileRef.current?.click()}
            >
              <FolderOpen className="h-5 w-5" />
              Elegir desde mis archivos
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Enlace de uso único · Powered by Gemma 4
          </p>
        </div>
      )}
    </div>
  )
}
