'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Empresa } from '@/types'

const RUBROS_SUGERIDOS = [
  'Ferretería',
  'Transporte',
  'Restaurant',
  'Consultoría',
  'Retail',
  'Construcción',
  'Tecnología',
  'Salud',
  'Educación',
  'Agropecuario',
]

interface EmpresaDialogProps {
  open: boolean
  empresa?: Empresa | null
  onClose: () => void
  onSuccess: () => void
}

export function EmpresaDialog({
  open,
  empresa,
  onClose,
  onSuccess,
}: EmpresaDialogProps) {
  const isEditing = !!empresa

  const [nombre, setNombre] = useState('')
  const [ruc, setRuc] = useState('')
  const [rubro, setRubro] = useState('')
  const [regimen, setRegimen] = useState<string>('RMT')
  const [tipoContrato, setTipoContrato] = useState<string>('emese')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (empresa) {
      setNombre(empresa.nombre)
      setRuc(empresa.ruc ?? '')
      setRubro(empresa.rubro)
      setRegimen(empresa.regimen)
      setTipoContrato(empresa.tipo_contrato)
    } else {
      setNombre('')
      setRuc('')
      setRubro('')
      setRegimen('RMT')
      setTipoContrato('emese')
    }
    setError(null)
  }, [empresa, open])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (ruc && !/^\d{11}$/.test(ruc)) {
      setError('El RUC debe tener exactamente 11 dígitos numéricos.')
      return
    }

    setLoading(true)

    const body = {
      nombre: nombre.trim(),
      ruc: ruc.trim() || null,
      rubro: rubro.trim(),
      regimen,
      tipo_contrato: tipoContrato,
    }

    const url = isEditing
      ? `/api/empresas/${empresa.id}`
      : '/api/empresas'
    const method = isEditing ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Error al guardar la empresa.')
      setLoading(false)
      return
    }

    setLoading(false)
    onSuccess()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar empresa' : 'Nueva empresa'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre de la empresa *</Label>
            <Input
              id="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Ferretería El Sol SAC"
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ruc">RUC (11 dígitos)</Label>
            <Input
              id="ruc"
              value={ruc}
              onChange={(e) => setRuc(e.target.value.replace(/\D/g, '').slice(0, 11))}
              placeholder="20123456789"
              inputMode="numeric"
              pattern="[0-9]{11}"
              maxLength={11}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rubro">Rubro del negocio *</Label>
            <Input
              id="rubro"
              list="rubros-list"
              value={rubro}
              onChange={(e) => setRubro(e.target.value)}
              placeholder="Ej: Ferretería"
              required
              disabled={loading}
            />
            <datalist id="rubros-list">
              {RUBROS_SUGERIDOS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <Label htmlFor="regimen">Régimen tributario</Label>
            <Select value={regimen} onValueChange={setRegimen} disabled={loading}>
              <SelectTrigger id="regimen">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RMT">RMT — Régimen MYPE Tributario</SelectItem>
                <SelectItem value="RER">RER — Régimen Especial</SelectItem>
                <SelectItem value="RG">RG — Régimen General</SelectItem>
                <SelectItem value="NRUS">NRUS — Nuevo RUS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tipo_contrato">Tipo de contrato</Label>
            <Select
              value={tipoContrato}
              onValueChange={setTipoContrato}
              disabled={loading}
            >
              <SelectTrigger id="tipo_contrato">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="emese">Por mes</SelectItem>
                <SelectItem value="fijo">Contrato fijo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading
                ? 'Guardando...'
                : isEditing
                  ? 'Guardar cambios'
                  : 'Crear empresa'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
