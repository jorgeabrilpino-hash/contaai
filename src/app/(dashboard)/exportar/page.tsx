'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Download, FileSpreadsheet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PeriodoSelector } from '@/components/periodo-selector'
import { createClient } from '@/lib/supabase/client'

const STORAGE_KEY = 'empresa_activa_id'

function getPeriodoActual(): string {
  return new Date().toISOString().slice(0, 7)
}

function ExportarContent() {
  const searchParams = useSearchParams()
  const periodo = searchParams.get('periodo') ?? getPeriodoActual()

  const [empresaId, setEmpresaId] = useState<string | null>(null)
  const [empresaNombre, setEmpresaNombre] = useState<string>('')
  const [totalConfirmados, setTotalConfirmados] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    setEmpresaId(stored)
  }, [])

  const fetchResumen = useCallback(async (empId: string, per: string) => {
    setLoading(true)
    const supabase = createClient()

    const [{ data: empresa }, { count }] = await Promise.all([
      supabase.from('empresas').select('nombre').eq('id', empId).single(),
      supabase
        .from('documentos')
        .select('*', { count: 'exact', head: true })
        .eq('empresa_id', empId)
        .eq('periodo', per)
        .eq('estado', 'confirmado'),
    ])

    if (empresa) setEmpresaNombre(empresa.nombre)
    setTotalConfirmados(count ?? 0)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!empresaId) {
      setLoading(false)
      return
    }
    fetchResumen(empresaId, periodo)
  }, [empresaId, periodo, fetchResumen])

  useEffect(() => {
    function onEmpresaChanged(e: Event) {
      const id = (e as CustomEvent<string>).detail
      setEmpresaId(id)
    }
    window.addEventListener('empresaChanged', onEmpresaChanged)
    return () => window.removeEventListener('empresaChanged', onEmpresaChanged)
  }, [])

  const downloadUrl = empresaId
    ? `/api/export/excel?periodo=${periodo}&empresa_id=${empresaId}`
    : '#'

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Exportar</h1>
          <p className="text-sm text-muted-foreground">
            Descarga tu registro contable en Excel
          </p>
        </div>
        <PeriodoSelector defaultValue={periodo} />
      </div>

      <div className="flex-1 overflow-auto p-6">
        {!empresaId && !loading ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="font-medium text-muted-foreground">
              Selecciona una empresa en el menú lateral
            </p>
          </div>
        ) : (
          <div className="max-w-lg space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileSpreadsheet className="h-5 w-5 text-green-600" />
                  Registro de Compras — {periodo}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Empresa</span>
                      <span className="font-medium">{empresaNombre}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Período</span>
                      <span className="font-medium">{periodo}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Documentos confirmados</span>
                      <span className="font-medium">{totalConfirmados}</span>
                    </div>
                  </div>
                )}

                <div className="pt-2 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    El archivo incluye 3 hojas: Registro de Compras, Resumen por Cuenta PCGE e Información del período.
                  </p>
                  <Button
                    asChild
                    disabled={!empresaId || loading || totalConfirmados === 0}
                    className="w-full"
                  >
                    <a href={downloadUrl} download>
                      <Download className="h-4 w-4 mr-2" />
                      {totalConfirmados === 0
                        ? 'Sin documentos confirmados'
                        : `Descargar Excel (${totalConfirmados} doc${totalConfirmados !== 1 ? 's' : ''})`}
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ExportarPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col h-full">
          <div className="border-b px-6 py-4">
            <Skeleton className="h-7 w-32" />
          </div>
          <div className="p-6">
            <Skeleton className="h-48 w-full max-w-lg" />
          </div>
        </div>
      }
    >
      <ExportarContent />
    </Suspense>
  )
}
