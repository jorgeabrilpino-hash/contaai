import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { UploadPublicaClient } from './upload-client'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function UploadTokenPage({ params }: PageProps) {
  const { token } = await params

  const admin = createAdminClient()
  const { data: tokenData } = await admin
    .from('upload_tokens')
    .select('empresa_id, expires_at, empresas(nombre)')
    .eq('token', token)
    .eq('usado', false)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (!tokenData) {
    notFound()
  }

  const empresas = tokenData.empresas as unknown as { nombre: string } | null
  const empresaNombre = empresas?.nombre ?? 'Empresa'

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">ContaAI</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Sube tu comprobante de pago
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <UploadPublicaClient
            empresaNombre={empresaNombre}
            expiresAt={tokenData.expires_at}
            token={token}
            empresaId={tokenData.empresa_id}
          />
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Enlace de uso único generado de forma segura · Powered by Gemma 4
        </p>
      </div>
    </main>
  )
}
