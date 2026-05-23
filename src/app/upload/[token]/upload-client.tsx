'use client'

import { useState, useEffect } from 'react'
import { CheckCircle } from 'lucide-react'
import { UploadZone } from '@/components/upload-zone'

interface UploadPublicaClientProps {
  empresaNombre: string
  expiresAt: string
  token: string
  empresaId: string
}

export function UploadPublicaClient({
  empresaNombre,
  expiresAt,
  token,
  empresaId,
}: UploadPublicaClientProps) {
  const [done, setDone] = useState(false)
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    function updateTimer() {
      const diff = new Date(expiresAt).getTime() - Date.now()
      if (diff <= 0) {
        setTimeLeft('Expirado')
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

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <CheckCircle className="h-16 w-16 text-green-500" />
        <h2 className="text-xl font-semibold text-green-700">
          Tu documento fue recibido
        </h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          El contador revisará y clasificará tu comprobante. Puedes cerrar esta ventana.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Empresa:{' '}
          <span className="font-medium text-foreground">{empresaNombre}</span>
        </span>
        <span
          className={`font-mono font-semibold tabular-nums ${
            timeLeft === 'Expirado' ? 'text-destructive' : 'text-amber-600'
          }`}
        >
          ⏱ {timeLeft}
        </span>
      </div>

      {timeLeft === 'Expirado' ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 py-10 px-6 text-center">
          <p className="text-sm text-destructive font-medium">
            Este enlace ha expirado. Solicita uno nuevo al contador.
          </p>
        </div>
      ) : (
        <UploadZone
          empresaId={empresaId}
          token={token}
          onConfirmed={() => setDone(true)}
        />
      )}
    </div>
  )
}
