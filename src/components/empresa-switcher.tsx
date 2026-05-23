'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Building2, Plus } from 'lucide-react'

const STORAGE_KEY = 'empresa_activa_id'

interface EmpresaSwitcherProps {
  empresas: Array<{ id: string; nombre: string; ruc: string | null }>
}

export function EmpresaSwitcher({ empresas }: EmpresaSwitcherProps) {
  const router = useRouter()
  const [empresaId, setEmpresaId] = useState<string>('')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const valid = empresas.find((e) => e.id === stored)
    const initial = valid ? valid.id : (empresas[0]?.id ?? '')
    setEmpresaId(initial)
    if (initial && (!stored || !valid)) {
      localStorage.setItem(STORAGE_KEY, initial)
    }
  }, [empresas])

  function handleChange(id: string) {
    setEmpresaId(id)
    localStorage.setItem(STORAGE_KEY, id)
    window.dispatchEvent(new CustomEvent('empresaChanged', { detail: id }))
    router.refresh()
  }

  if (empresas.length === 0) {
    return (
      <Link
        href="/empresas"
        className="flex items-center gap-2 text-sm text-primary hover:underline"
      >
        <Plus className="h-4 w-4" />
        Agregar empresa
      </Link>
    )
  }

  return (
    <Select value={empresaId} onValueChange={handleChange}>
      <SelectTrigger className="w-full h-9 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="Seleccionar empresa" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {empresas.map((empresa) => (
          <SelectItem key={empresa.id} value={empresa.id}>
            <div className="flex flex-col">
              <span className="font-medium">{empresa.nombre}</span>
              {empresa.ruc && (
                <span className="text-xs text-muted-foreground">
                  RUC: {empresa.ruc}
                </span>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
