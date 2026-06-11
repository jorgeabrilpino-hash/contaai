'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { UploadZone } from '@/components/upload-zone'
import { createClient } from '@/lib/supabase/client'
import { PCGE_CUENTAS } from '@/lib/pcge'
import type { Documento, DocumentoEstado } from '@/types'

const STORAGE_KEY = 'empresa_activa_id'

// ─── Badges ────────────────────────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: DocumentoEstado }) {
  const cfg = {
    pendiente: 'bg-amber-100 text-amber-800 border-amber-200',
    revisado: 'bg-blue-100 text-blue-800 border-blue-200',
    confirmado: 'bg-green-100 text-green-800 border-green-200',
  }
  const label = { pendiente: 'Pendiente', revisado: 'Revisado', confirmado: 'Confirmado' }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg[estado]}`}
    >
      {label[estado]}
    </span>
  )
}

function ConfianzaBadge({ confianza }: { confianza: number | null }) {
  if (confianza === null) return <span className="text-muted-foreground text-xs">—</span>
  const pct = Math.round(confianza * 100)
  const color =
    pct >= 85 ? 'text-green-600' : pct >= 60 ? 'text-amber-600' : 'text-red-600'
  return <span className={`text-xs font-semibold ${color}`}>{pct}%</span>
}

// ─── Inner component (needs useSearchParams) ────────────────────────────────

function DocumentosContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const periodoParam = searchParams.get('periodo')
  const periodo = periodoParam ?? format(new Date(), 'yyyy-MM')

  const [empresaId, setEmpresaId] = useState<string | null>(null)
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<Documento | null>(null)
  const [cuentaEdit, setCuentaEdit] = useState<string>('')
  const [confirming, setConfirming] = useState(false)

  // Leer empresa activa de localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    setEmpresaId(stored)
  }, [])

  const fetchDocumentos = useCallback(async (empId: string, per: string) => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('documentos')
      .select('*')
      .eq('empresa_id', empId)
      .eq('periodo', per)
      .order('created_at', { ascending: false })
    setDocumentos(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!empresaId) {
      setLoading(false)
      return
    }
    fetchDocumentos(empresaId, periodo)
  }, [empresaId, periodo, fetchDocumentos])

  // Escuchar cambios de empresa activa
  useEffect(() => {
    function onEmpresaChanged(e: Event) {
      const id = (e as CustomEvent<string>).detail
      setEmpresaId(id)
    }
    window.addEventListener('empresaChanged', onEmpresaChanged)
    return () => window.removeEventListener('empresaChanged', onEmpresaChanged)
  }, [])

  function handlePeriodoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('periodo', e.target.value)
    router.push(`/documentos?${params.toString()}`)
  }

  function handleUploadSuccess() {
    setDialogOpen(false)
    if (empresaId) fetchDocumentos(empresaId, periodo)
  }

  function openDetalle(doc: Documento) {
    setSelectedDoc(doc)
    setCuentaEdit(doc.cuenta_pcge ?? '')
  }

  async function handleConfirmDoc() {
    if (!selectedDoc || !cuentaEdit) return
    setConfirming(true)
    try {
      const res = await fetch('/api/documents/confirm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documento_id: selectedDoc.id,
          cuenta_pcge: cuentaEdit,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? 'Error al confirmar el documento')
      } else {
        toast.success('Documento confirmado')
        setSelectedDoc(null)
        if (empresaId) fetchDocumentos(empresaId, periodo)
      }
    } catch {
      toast.error('Error de conexión')
    }
    setConfirming(false)
  }

  // KPIs
  const totalIGV = documentos.reduce((sum, d) => sum + (d.igv ?? 0), 0)
  const pendientes = documentos.filter((d) => d.estado === 'pendiente').length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 md:px-6 py-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Documentos</h1>
            <p className="text-sm text-muted-foreground">
              {documentos.length} doc{documentos.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
              IGV: <span className="font-medium">S/ {totalIGV.toFixed(2)}</span>
              {pendientes > 0 && (
                <>
                  &nbsp;·&nbsp;
                  <span className="text-amber-600 font-medium">
                    {pendientes} pendiente{pendientes !== 1 ? 's' : ''}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <input
              type="month"
              value={periodo}
              onChange={handlePeriodoChange}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            />
            <Button
              onClick={() => setDialogOpen(true)}
              disabled={!empresaId}
            >
              <Upload className="h-4 w-4 mr-2" />
              Subir documento
            </Button>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {!empresaId ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="font-medium">Selecciona una empresa en el menú lateral</p>
            <p className="text-sm mt-1">para ver sus documentos.</p>
          </div>
        ) : loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : documentos.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="font-medium">No hay documentos en {periodo}</p>
            <p className="text-sm mt-1">Sube tu primera factura o boleta.</p>
            <Button className="mt-4" onClick={() => setDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Subir documento
            </Button>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Emisor</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">IGV</TableHead>
                  <TableHead>Cuenta PCGE</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Confianza</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documentos.map((doc) => (
                  <TableRow
                    key={doc.id}
                    onClick={() => openDetalle(doc)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-xs">
                        {doc.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[180px]">
                      <p className="truncate font-medium text-sm">
                        {doc.razon_social ?? '—'}
                      </p>
                      {doc.ruc_emisor && (
                        <p className="text-xs text-muted-foreground">
                          {doc.ruc_emisor}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {doc.fecha_emision ?? '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {doc.monto_base !== null ? `S/ ${doc.monto_base.toFixed(2)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {doc.igv !== null ? `S/ ${doc.igv.toFixed(2)}` : '—'}
                    </TableCell>
                    <TableCell>
                      {doc.cuenta_pcge ? (
                        <span className="font-mono text-sm">{doc.cuenta_pcge}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <EstadoBadge estado={doc.estado} />
                    </TableCell>
                    <TableCell>
                      <ConfianzaBadge confianza={doc.confianza_ia} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Dialog de detalle / confirmación */}
      <Dialog open={selectedDoc !== null} onOpenChange={(v) => !v && setSelectedDoc(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detalle del documento</DialogTitle>
            <DialogDescription>
              Revisa la clasificación sugerida por Gemma 4 y confírmala o corrígela.
            </DialogDescription>
          </DialogHeader>
          {selectedDoc && (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Tipo</dt>
                <dd className="font-medium capitalize">{selectedDoc.tipo}</dd>
                <dt className="text-muted-foreground">Emisor</dt>
                <dd className="font-medium truncate">{selectedDoc.razon_social ?? '—'}</dd>
                <dt className="text-muted-foreground">RUC</dt>
                <dd className="font-mono text-xs pt-0.5">{selectedDoc.ruc_emisor ?? '—'}</dd>
                <dt className="text-muted-foreground">Fecha</dt>
                <dd>{selectedDoc.fecha_emision ?? '—'}</dd>
                <dt className="text-muted-foreground">Base / IGV</dt>
                <dd className="tabular-nums">
                  {selectedDoc.monto_base !== null ? `S/ ${selectedDoc.monto_base.toFixed(2)}` : '—'}
                  {' / '}
                  {selectedDoc.igv !== null ? `S/ ${selectedDoc.igv.toFixed(2)}` : '—'}
                </dd>
                <dt className="text-muted-foreground">Total</dt>
                <dd className="font-semibold tabular-nums">
                  {selectedDoc.total !== null ? `S/ ${selectedDoc.total.toFixed(2)}` : '—'}
                </dd>
                <dt className="text-muted-foreground">Estado</dt>
                <dd><EstadoBadge estado={selectedDoc.estado} /></dd>
                {selectedDoc.descripcion_ia && (
                  <>
                    <dt className="text-muted-foreground">Descripción IA</dt>
                    <dd className="text-xs">{selectedDoc.descripcion_ia}</dd>
                  </>
                )}
              </dl>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Cuenta PCGE</p>
                <Select value={cuentaEdit} onValueChange={setCuentaEdit}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona una cuenta" />
                  </SelectTrigger>
                  <SelectContent>
                    {cuentaEdit &&
                      !PCGE_CUENTAS.some((c) => c.codigo === cuentaEdit) && (
                        <SelectItem value={cuentaEdit}>
                          {cuentaEdit} — {selectedDoc.nombre_cuenta ?? 'Sugerida por IA'}
                        </SelectItem>
                      )}
                    {PCGE_CUENTAS.map((c) => (
                      <SelectItem key={c.codigo} value={c.codigo}>
                        {c.codigo} — {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                <Button variant="outline" onClick={() => setSelectedDoc(null)}>
                  Cerrar
                </Button>
                <Button
                  onClick={handleConfirmDoc}
                  disabled={confirming || !cuentaEdit}
                >
                  {confirming
                    ? 'Confirmando...'
                    : selectedDoc.estado === 'confirmado'
                      ? 'Actualizar cuenta'
                      : 'Confirmar documento'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de upload */}
      <Dialog open={dialogOpen} onOpenChange={(v) => !v && setDialogOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Subir comprobante</DialogTitle>
            <DialogDescription>
              Sube una factura o boleta en PDF, JPG o PNG. Gemma 4 extraerá los datos y clasificará la cuenta contable automáticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            {empresaId && (
              <UploadZone
                empresaId={empresaId}
                onConfirmed={handleUploadSuccess}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Export con Suspense (requerido por useSearchParams) ────────────────────

export default function DocumentosPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col h-full">
          <div className="border-b px-6 py-4">
            <Skeleton className="h-7 w-40" />
          </div>
          <div className="p-6 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      }
    >
      <DocumentosContent />
    </Suspense>
  )
}
