'use client'

import { useState } from 'react'
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { PCGE_CUENTAS } from '@/lib/pcge'
import type { DocumentProcessResult } from '@/types'

interface ClasificacionResultProps {
  resultado: DocumentProcessResult
  onConfirmed: () => void
  onCancel: () => void
}

function fmt(val: number | null, prefix = 'S/ ') {
  if (val === null) return '—'
  return `${prefix}${val.toFixed(2)}`
}

function ConfianzaBar({ confianza }: { confianza: number }) {
  const pct = Math.round(confianza * 100)
  const color =
    pct >= 85 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'
  const textColor =
    pct >= 85 ? 'text-green-600' : pct >= 60 ? 'text-amber-600' : 'text-red-600'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${textColor}`}>
        {pct}%
      </span>
    </div>
  )
}

export function ClasificacionResult({
  resultado,
  onConfirmed,
  onCancel,
}: ClasificacionResultProps) {
  const { extraccion, clasificacion, documento } = resultado
  const [cuentaPcge, setCuentaPcge] = useState(clasificacion.cuenta_pcge)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setConfirming(true)
    setError(null)

    const res = await fetch('/api/documents/confirm', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documento_id: documento.id,
        cuenta_pcge: cuentaPcge,
      }),
    })

    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Error al confirmar el documento.')
      setConfirming(false)
      return
    }

    onConfirmed()
  }

  return (
    <Card className="border-green-200 bg-green-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-green-700">
          <CheckCircle className="h-5 w-5" />
          Documento analizado por Gemma 4
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Datos extraídos */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Tipo</p>
            <p className="font-medium capitalize">
              {extraccion.tipo ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Fecha</p>
            <p className="font-medium">{extraccion.fecha_emision ?? '—'}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Emisor</p>
            <p className="font-medium">{extraccion.razon_social ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Base imponible</p>
            <p className="font-medium">{fmt(extraccion.monto_base)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">IGV (18%)</p>
            <p className="font-medium">{fmt(extraccion.igv)}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
            <p className="text-lg font-bold">{fmt(extraccion.total)}</p>
          </div>
        </div>

        <Separator />

        {/* Clasificación PCGE */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Clasificación PCGE</p>
            <Badge
              variant="outline"
              className={
                clasificacion.es_deducible
                  ? 'border-green-500 text-green-700'
                  : 'border-red-400 text-red-600'
              }
            >
              {clasificacion.es_deducible ? 'Deducible' : 'No deducible'}
            </Badge>
          </div>

          <div className="space-y-1">
            <Label htmlFor="cuenta-pcge" className="text-xs text-muted-foreground">
              Cuenta contable (editable)
            </Label>
            <Input
              id="cuenta-pcge"
              list="pcge-list"
              value={cuentaPcge}
              onChange={(e) => setCuentaPcge(e.target.value)}
              className="font-mono"
              placeholder="Ej: 60.1"
            />
            <datalist id="pcge-list">
              {PCGE_CUENTAS.map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.codigo} — {c.nombre}
                </option>
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">{clasificacion.nombre_cuenta}</p>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Confianza de la IA</p>
            <ConfianzaBar confianza={clasificacion.confianza} />
          </div>

          {clasificacion.razon && (
            <p className="text-xs text-muted-foreground italic">
              {clasificacion.razon}
            </p>
          )}

          {clasificacion.alerta && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-50 border border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">{clasificacion.alerta}</p>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <XCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Acciones */}
        <div className="flex gap-2 pt-1">
          <Button
            onClick={handleConfirm}
            disabled={confirming}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
          >
            {confirming ? 'Confirmando...' : '✅ Confirmar clasificación'}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={confirming}>
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
