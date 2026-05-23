'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Upload, BarChart3, Download, AlertTriangle, FileText, TrendingUp, Clock, CheckCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import type { Documento, DocumentoEstado } from '@/types'

const STORAGE_KEY = 'empresa_activa_id'

function getPeriodoActual(): string {
  return new Date().toISOString().slice(0, 7)
}

function getPeriodoLabel(periodo: string): string {
  const [y, m] = periodo.split('-')
  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]
  return `${meses[parseInt(m) - 1]} ${y}`
}

function getDiasHastaVencimiento(): number {
  const now = new Date()
  const vencimiento = new Date(now.getFullYear(), now.getMonth() + 1, 15)
  return Math.ceil((vencimiento.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function EstadoBadge({ estado }: { estado: DocumentoEstado }) {
  const cfg: Record<DocumentoEstado, string> = {
    pendiente: 'bg-amber-100 text-amber-800',
    revisado: 'bg-blue-100 text-blue-800',
    confirmado: 'bg-green-100 text-green-800',
  }
  const label: Record<DocumentoEstado, string> = {
    pendiente: 'Pendiente',
    revisado: 'Revisado',
    confirmado: 'Confirmado',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg[estado]}`}>
      {label[estado]}
    </span>
  )
}

function KpiCard({ title, value, subtitle, icon }: {
  title: string
  value: string
  subtitle?: string
  icon: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  )
}

export default function DashboardHomePage() {
  const periodo = getPeriodoActual()
  const periodoLabel = getPeriodoLabel(periodo)
  const diasVencimiento = getDiasHastaVencimiento()

  const [empresaId, setEmpresaId] = useState<string | null>(null)
  const [empresaNombre, setEmpresaNombre] = useState<string>('')
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    setEmpresaId(stored)
  }, [])

  const fetchData = useCallback(async (empId: string) => {
    setLoading(true)
    const supabase = createClient()

    const [{ data: empresa }, { data: docs }] = await Promise.all([
      supabase.from('empresas').select('nombre').eq('id', empId).single(),
      supabase
        .from('documentos')
        .select('id, tipo, razon_social, fecha_emision, total, igv, monto_base, estado')
        .eq('empresa_id', empId)
        .eq('periodo', periodo)
        .order('created_at', { ascending: false }),
    ])

    if (empresa) setEmpresaNombre(empresa.nombre)
    setDocumentos((docs as Documento[]) ?? [])
    setLoading(false)
  }, [periodo])

  useEffect(() => {
    if (!empresaId) {
      setLoading(false)
      return
    }
    fetchData(empresaId)
  }, [empresaId, fetchData])

  useEffect(() => {
    function onEmpresaChanged(e: Event) {
      const id = (e as CustomEvent<string>).detail
      setEmpresaId(id)
    }
    window.addEventListener('empresaChanged', onEmpresaChanged)
    return () => window.removeEventListener('empresaChanged', onEmpresaChanged)
  }, [])

  const totalIGV = documentos.reduce((sum, d) => sum + (d.igv ?? 0), 0)
  const totalBase = documentos.reduce((sum, d) => sum + (d.monto_base ?? 0), 0)
  const confirmados = documentos.filter((d) => d.estado === 'confirmado').length
  const pendientes = documentos.filter((d) => d.estado === 'pendiente').length
  const recientes = documentos.slice(0, 5)

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Inicio</h1>
        <p className="text-sm text-muted-foreground">
          {empresaNombre ? `${empresaNombre} · ` : ''}{periodoLabel}
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {diasVencimiento <= 5 && (
          <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">
              Vencimiento SUNAT en {diasVencimiento} día{diasVencimiento !== 1 ? 's' : ''} — revisa tus documentos pendientes.
            </p>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2"><Skeleton className="h-4 w-28" /></CardHeader>
                <CardContent><Skeleton className="h-8 w-24" /></CardContent>
              </Card>
            ))}
          </div>
        ) : !empresaId ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="font-medium text-muted-foreground">Selecciona una empresa en el menú lateral</p>
            <p className="text-sm text-muted-foreground mt-1">para ver el resumen del período.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard title="Total IGV" value={`S/ ${totalIGV.toFixed(2)}`} subtitle={periodoLabel} icon={<TrendingUp className="h-4 w-4" />} />
            <KpiCard title="Base Imponible" value={`S/ ${totalBase.toFixed(2)}`} subtitle={`${documentos.length} comprobante${documentos.length !== 1 ? 's' : ''}`} icon={<FileText className="h-4 w-4" />} />
            <KpiCard title="Confirmados" value={String(confirmados)} subtitle="listos para reporte" icon={<CheckCircle className="h-4 w-4" />} />
            <KpiCard title="Pendientes" value={String(pendientes)} subtitle="requieren revisión" icon={<Clock className="h-4 w-4" />} />
          </div>
        )}

        {empresaId && !loading && recientes.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Últimos documentos</h2>
              <Link href="/documentos" className="text-xs text-primary hover:underline">Ver todos</Link>
            </div>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Emisor</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Fecha</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Total</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {recientes.map((doc) => (
                    <tr key={doc.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 max-w-[200px]">
                        <p className="truncate font-medium">{doc.razon_social ?? '—'}</p>
                        <p className="text-xs text-muted-foreground capitalize">{doc.tipo}</p>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{doc.fecha_emision ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{doc.total !== null ? `S/ ${doc.total.toFixed(2)}` : '—'}</td>
                      <td className="px-4 py-2.5"><EstadoBadge estado={doc.estado} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-sm font-semibold mb-3">Acciones rápidas</h2>
          <div className="grid grid-cols-3 gap-3">
            <Link href="/documentos">
              <Card className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary/50">
                <CardContent className="flex flex-col items-center justify-center gap-2 py-6">
                  <Upload className="h-6 w-6 text-primary" />
                  <span className="text-sm font-medium">Subir documento</span>
                </CardContent>
              </Card>
            </Link>
            <Link href="/reportes">
              <Card className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary/50">
                <CardContent className="flex flex-col items-center justify-center gap-2 py-6">
                  <BarChart3 className="h-6 w-6 text-primary" />
                  <span className="text-sm font-medium">Ver reportes</span>
                </CardContent>
              </Card>
            </Link>
            <Link href="/exportar">
              <Card className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary/50">
                <CardContent className="flex flex-col items-center justify-center gap-2 py-6">
                  <Download className="h-6 w-6 text-primary" />
                  <span className="text-sm font-medium">Exportar Excel</span>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
