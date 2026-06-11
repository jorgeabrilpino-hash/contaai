'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmpresaDialog } from './components/empresa-dialog'
import type { Empresa } from '@/types'

const STORAGE_KEY = 'empresa_activa_id'

const REGIMEN_LABEL: Record<string, string> = {
  RMT: 'RMT',
  RER: 'RER',
  RG: 'RG',
  NRUS: 'NRUS',
}

const CONTRATO_LABEL: Record<string, string> = {
  emese: 'Por mes',
  fijo: 'Fijo',
}

export default function EmpresasPage() {
  const router = useRouter()
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading, setLoading] = useState(true)
  const [empresaActiva, setEmpresaActiva] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [empresaToDelete, setEmpresaToDelete] = useState<Empresa | null>(null)

  const fetchEmpresas = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/empresas')
    const json = await res.json()
    setEmpresas(json.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    setEmpresaActiva(localStorage.getItem(STORAGE_KEY))
    fetchEmpresas()
  }, [fetchEmpresas])

  function handleNew() {
    setEditingEmpresa(null)
    setDialogOpen(true)
  }

  function handleEdit(empresa: Empresa) {
    setEditingEmpresa(empresa)
    setDialogOpen(true)
  }

  async function handleDeleteConfirmed() {
    const empresa = empresaToDelete
    if (!empresa) return
    setEmpresaToDelete(null)

    setDeletingId(empresa.id)
    const res = await fetch(`/api/empresas/${empresa.id}`, { method: 'DELETE' })
    const json = await res.json()

    if (!res.ok) {
      toast.error(json.error ?? 'Error al eliminar la empresa.')
      setDeletingId(null)
      return
    }

    // Si era la activa, limpiar localStorage
    if (localStorage.getItem(STORAGE_KEY) === empresa.id) {
      localStorage.removeItem(STORAGE_KEY)
    }

    setDeletingId(null)
    toast.success(`Empresa "${empresa.nombre}" eliminada`)
    fetchEmpresas()
    router.refresh() // actualiza el switcher del sidebar (Server Component)
  }

  function handleSuccess() {
    fetchEmpresas()
    router.refresh() // actualiza el switcher del sidebar (Server Component)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 md:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Empresas</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona las empresas que contabilizas
          </p>
        </div>
        <Button onClick={handleNew}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva empresa
        </Button>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : empresas.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium">No tienes empresas registradas</p>
            <p className="text-sm mt-1">
              Crea tu primera empresa para comenzar a clasificar documentos.
            </p>
            <Button onClick={handleNew} className="mt-4">
              <Plus className="h-4 w-4 mr-2" />
              Crear empresa
            </Button>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>RUC</TableHead>
                  <TableHead>Rubro</TableHead>
                  <TableHead>Régimen</TableHead>
                  <TableHead>Contrato</TableHead>
                  <TableHead className="w-[100px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {empresas.map((empresa) => {
                  const isActiva = empresa.id === empresaActiva
                  return (
                    <TableRow key={empresa.id} className={isActiva ? 'bg-primary/5' : ''}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {empresa.nombre}
                          {isActiva && (
                            <Badge variant="default" className="text-xs">
                              Activa
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {empresa.ruc ?? '—'}
                      </TableCell>
                      <TableCell>{empresa.rubro}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {REGIMEN_LABEL[empresa.regimen] ?? empresa.regimen}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {CONTRATO_LABEL[empresa.tipo_contrato] ?? empresa.tipo_contrato}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(empresa)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setEmpresaToDelete(empresa)}
                            disabled={deletingId === empresa.id}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <EmpresaDialog
        open={dialogOpen}
        empresa={editingEmpresa}
        onClose={() => setDialogOpen(false)}
        onSuccess={handleSuccess}
      />

      {/* Confirmación de eliminación (sin window.confirm: no bloquea el hilo) */}
      <AlertDialog
        open={empresaToDelete !== null}
        onOpenChange={(v) => !v && setEmpresaToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará &quot;{empresaToDelete?.nombre}&quot;. Esta acción no
              se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirmed}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
