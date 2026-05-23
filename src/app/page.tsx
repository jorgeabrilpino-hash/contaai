import Link from 'next/link'
import {
  FileText,
  BarChart3,
  Bot,
  Shield,
  Download,
  Building2,
  ArrowRight,
  CheckCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const FEATURES = [
  {
    icon: FileText,
    title: 'OCR con Gemma 4',
    desc: 'Extrae automáticamente RUC, montos, fechas y datos de tus facturas y boletas mediante visión artificial.',
  },
  {
    icon: BarChart3,
    title: 'Clasificación PCGE',
    desc: 'Gemma 4 clasifica cada comprobante en la cuenta contable correcta según tu rubro y régimen tributario.',
  },
  {
    icon: Building2,
    title: 'Multi-empresa',
    desc: 'Gestiona varias empresas desde una sola cuenta. Cada empresa tiene sus documentos aislados y seguros.',
  },
  {
    icon: Bot,
    title: 'Bot de Telegram',
    desc: 'Consulta el IGV del mes, documentos pendientes y fechas de vencimiento SUNAT desde Telegram.',
  },
  {
    icon: Shield,
    title: 'Seguridad total',
    desc: 'Row Level Security en Supabase garantiza que cada contador solo vea sus propios datos.',
  },
  {
    icon: Download,
    title: 'Exportar a Excel',
    desc: 'Descarga tu Registro de Compras en formato .xlsx listo para importar a sistemas contables.',
  },
]

const BENEFICIOS = [
  'Compatible con regímenes RMT, RER, RG y NRUS',
  'Alerta de vencimiento SUNAT automática',
  'Confianza de clasificación IA visible',
  'Subida segura de documentos por clientes vía Telegram',
  'Resumen mensual de IGV y base imponible',
]

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ── NAVBAR ─────────────────────────────────────────────────── */}
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight">ContaAI</span>
            <span className="hidden sm:inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Powered by Gemma 4
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link href="/login">Iniciar sesión</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Crear cuenta</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ── HERO ───────────────────────────────────────────────────── */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24 bg-gradient-to-b from-primary/5 to-background">
        <div className="inline-flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-sm text-muted-foreground mb-8">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          Gemma 4 Challenge — DEV.to 2026
        </div>

        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight max-w-3xl leading-tight mb-6">
          Contabilidad peruana{' '}
          <span className="text-primary">automatizada con IA</span>
        </h1>

        <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
          ContaAI usa <strong>Google Gemma 4</strong> para clasificar facturas y boletas
          automáticamente según el PCGE. Diseñado para contadores y MYPEs en Perú.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <Button size="lg" asChild className="gap-2">
            <Link href="/register">
              Crear cuenta gratis
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">Ya tengo cuenta</Link>
          </Button>
        </div>
      </section>

      {/* ── FEATURES ───────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-3">Todo lo que necesita tu contabilidad</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Gemma 4 es el núcleo de ContaAI — no un accesorio, sino el motor que
              entiende tus documentos y los clasifica con contexto contable peruano.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-xl border bg-background p-6 space-y-3 hover:shadow-md transition-shadow"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BENEFICIOS ─────────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto flex flex-col lg:flex-row gap-12 items-center">
          <div className="flex-1">
            <h2 className="text-3xl font-bold mb-4">
              Hecho para la realidad<br />tributaria peruana
            </h2>
            <p className="text-muted-foreground mb-8">
              ContaAI conoce el PCGE, los regímenes tributarios y las fechas de
              vencimiento SUNAT. No es una herramienta genérica — está calibrado
              para el contexto fiscal peruano.
            </p>
            <ul className="space-y-3">
              {BENEFICIOS.map((b) => (
                <li key={b} className="flex items-center gap-3 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex-1 rounded-2xl border bg-muted/40 p-8 space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                G4
              </div>
              <div>
                <p className="text-sm font-medium">Gemma 4 analizando...</p>
                <p className="text-xs text-muted-foreground">google/gemma-4-31b-it</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tipo</span>
                <span className="font-medium">Factura</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Base imponible</span>
                <span className="font-medium">S/ 847.46</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IGV (18%)</span>
                <span className="font-medium">S/ 152.54</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cuenta PCGE</span>
                <span className="font-mono font-medium text-primary">60.1</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nombre</span>
                <span className="font-medium">Mercaderías</span>
              </div>
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">Confianza IA</span>
                  <span className="text-xs font-semibold text-green-600">94%</span>
                </div>
                <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full w-[94%] bg-green-500 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ──────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-primary text-primary-foreground">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Simplifica tu contabilidad hoy
          </h2>
          <p className="opacity-80 mb-8">
            Gratis durante el Gemma 4 Challenge. Sin tarjeta de crédito.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" asChild className="gap-2">
              <Link href="/register">
                Crear cuenta gratis
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="bg-transparent border-primary-foreground/30 hover:bg-primary-foreground/10">
              <Link href="/login">Iniciar sesión</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────── */}
      <footer className="border-t py-6 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>© 2026 ContaAI — Asistente contable para MYPEs peruanas</p>
          <p>
            Desarrollado para el{' '}
            <span className="font-medium text-foreground">Gemma 4 Challenge</span>
            {' '}· DEV.to / MLH
          </p>
        </div>
      </footer>
    </div>
  )
}
