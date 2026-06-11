'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Download, TrendingUp, FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { PeriodoSelector } from '@/components/periodo-selector'
import { createClient } from '@/lib/supabase/client'

const STORAGE_KEY = 'empresa_activa_id'

function getPeriodoActual(): string {
  return new Date().toISOString().slice(0, 7)
}

interface FilaPCGE {
  cuenta_pcge: string
  nombre_cuenta: string | null
  count: number
  base: number
  igv: number
  total: number
}

function ReportesContent() {
  const searchParams = useSearchParams()
  const periodoParam = searchParams.get('periodo')
  const periodo = periodoParam ?? getPeriodoActual()

  const [empresaId, setEmpresaId] = useState<string | null>(null)
  const [filas, setFilas] = useState<FilaPCGE[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    setEmpresaId(stored)
  }, [])

  const fetchReporte = useCallback(async (empId: string, per: string) => {
    setLoading(true)
    const supabase = createClient()

    const { data: docs } = await supabase
      .from('documentos')
      .select('cuenta_pcge, nombre_cuenta, monto_base, igv, total')
      .eq('empresa_id', empId)
      .eq('periodo', per)
      .eq('estado', 'confirmado')

    if (!docs) {
      setFilas([])
      setLoading(false)
      return
    }

    // Agrupar por cuenta_pcge en TypeScript
    const porCuenta = docs.reduce<Record<string, FilaPCGE>>((acc, doc) => {
      const key = doc.cuenta_pcge ?? 'sin-clasificar'
      if (!acc[key]) {
        acc[key] = {
          cuenta_pcge: key,
          nombre_cuenta: doc.nombre_cuenta,
          count: 0,
          base: 0,
          igv: 0,
          total: 0,
        }
      }
      acc[key].count++
      acc[key].base += doc.monto_base ?? 0
      acc[key].igv += doc.igv ?? 0
      acc[key].total += doc.total ?? 0
      return acc
    }, {})

    setFilas(Object.values(porCuenta).sort((a, b) => a.cuenta_pcge.localeCompare(b.cuenta_pcge)))
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!empresaId) {
      setLoading(false)
      return
    }
    fetchReporte(empresaId, periodo)
  }, [empresaId, periodo, fetchReporte])

  useEffect(() => {
    function onEmpresaChanged(e: Event) {
      const id = (e as CustomEvent<string>).detail
      setEmpresaId(id)
    }
    window.addEventListener('empresaChanged', onEmpresaChanged)
    return () => window.removeEventListener('empresaChanged', onEmpresaChanged)
  }, [])

  const totalIGV = filas.reduce((sum, f) => sum + f.igv, 0)
  const totalBase = filas.reduce((sum, f) => sum + f.base, 0)
  const totalGeneral = filas.reduce((sum, f) => sum + f.total, 0)
  const totalDocs = filas.reduce((sum, f) => sum + f.count, 0)

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-4 md:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Reportes</h1>
          <p className="text-sm text-muted-foreground">
            Solo documentos confirmados
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <PeriodoSelector defaultValue={periodo} />
          {empresaId && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/api/export/excel?periodo=${periodo}&empresa_id=${empresaId}`}>
                <Download className="h-4 w-4 mr-2" />
                Exportar Excel
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        {!empresaId && !loading ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="font-medium text-muted-foreground">Selecciona una empresa en el menú</p>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total IGV
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-9 w-36" />
                  ) : (
                    <>
                      <p className="text-3xl font-bold">S/ {totalIGV.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground mt-1">{periodo}</p>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Base Imponible
                  </CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-9 w-36" />
                  ) : (
                    <>
                      <p className="text-3xl font-bold">S/ {totalBase.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {totalDocs} documento{totalDocs !== 1 ? 's' : ''} confirmado{totalDocs !== 1 ? 's' : ''}
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Tabla por cuenta PCGE */}
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filas.length === 0 ? (
              <div className="rounded-lg border border-dashed p-10 text-center">
                <p className="font-medium text-muted-foreground">
                  No hay documentos confirmados en {periodo}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Sube y confirma comprobantes en la sección Documentos.
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cuenta PCGE</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="text-center">Docs</TableHead>
                      <TableHead className="text-right">Base Imponible</TableHead>
                      <TableHead className="text-right">IGV</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filas.map((fila) => (
                      <TableRow key={fila.cuenta_pcge}>
                        <TableCell className="font-mono font-medium">
                          {fila.cuenta_pcge}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {fila.nombre_cuenta ?? '—'}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {fila.count}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          S/ {fila.base.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          S/ {fila.igv.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          S/ {fila.total.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2} className="font-bold">
                        TOTAL
                      </TableCell>
                      <TableCell className="text-center font-bold tabular-nums">
                        {totalDocs}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        S/ {totalBase.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        S/ {totalIGV.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        S/ {totalGeneral.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function ReportesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col h-full">
          <div className="border-b px-6 py-4">
            <Skeleton className="h-7 w-32" />
          </div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
        </div>
      }
    >
      <ReportesContent />
    </Suspense>
  )
}
