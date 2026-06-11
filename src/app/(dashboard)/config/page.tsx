'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { CheckCircle, Copy, Unlink, Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'

const BOT_USERNAME =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? 'contaAI_gemma_bot'

interface ProfileState {
  telegramId: number | null
  telegramToken: string | null
}

export default function ConfigPage() {
  const [profile, setProfile] = useState<ProfileState | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadProfile = useCallback(async (): Promise<ProfileState | null> => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data } = await supabase
      .from('profiles')
      .select('telegram_id, telegram_token')
      .eq('id', user.id)
      .single()

    if (!data) return null
    return {
      telegramId: data.telegram_id,
      telegramToken: data.telegram_token,
    }
  }, [])

  useEffect(() => {
    loadProfile().then((p) => {
      setProfile(p)
      setLoading(false)
    })
  }, [loadProfile])

  // Mientras hay un código pendiente, detectar automáticamente la
  // vinculación: cuando el usuario toca "Conectar" en Telegram, esta
  // pantalla pasa sola a "Conectado" sin recargar.
  useEffect(() => {
    const waiting = !profile?.telegramId && !!profile?.telegramToken
    if (!waiting) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    pollRef.current = setInterval(async () => {
      const fresh = await loadProfile()
      if (fresh?.telegramId) {
        setProfile(fresh)
      }
    }, 4000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [profile?.telegramId, profile?.telegramToken, loadProfile])

  async function handleConnect() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/telegram/generate-token', { method: 'POST' })
      const json = await res.json()
      if (res.ok && json.token) {
        setProfile(prev => ({
          telegramId: prev?.telegramId ?? null,
          telegramToken: json.token,
        }))
      } else {
        setError(json.error ?? 'Error al generar el código.')
      }
    } catch {
      setError('Error de conexión.')
    }
    setGenerating(false)
  }

  async function handleUnlink() {
    setUnlinking(true)
    setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ telegram_id: null })
        .eq('id', user.id)

      if (updateError) {
        setError('Error al desvincular. Intenta de nuevo.')
      } else {
        setProfile(prev => prev ? { ...prev, telegramId: null, telegramToken: null } : prev)
      }
    }
    setUnlinking(false)
  }

  async function copyToClipboard() {
    if (!profile?.telegramToken) return
    await navigator.clipboard.writeText(`/start ${profile.telegramToken}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const deepLink = profile?.telegramToken
    ? `https://t.me/${BOT_USERNAME}?start=${profile.telegramToken}`
    : null

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-4 md:px-6 py-4">
        <h1 className="text-xl font-semibold">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Gestiona tu cuenta y vinculaciones
        </p>
      </div>

      <div className="p-4 md:p-6 max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <Send className="h-4 w-4" />
                Telegram
              </span>
              {!loading && (
                profile?.telegramId ? (
                  <Badge className="bg-green-100 text-green-800 border-green-200" variant="outline">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Conectado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    No conectado
                  </Badge>
                )
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-9 w-40" />
              </div>
            ) : profile?.telegramId ? (
              /* ── Conectado ── */
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Tu cuenta está vinculada a{' '}
                  <a
                    href={`https://t.me/${BOT_USERNAME}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary hover:underline"
                  >
                    @{BOT_USERNAME}
                  </a>
                  . Puedes preguntarle por el IGV del mes, documentos pendientes,
                  dudas contables, o pedirle un enlace para subir facturas.
                </p>
                <Separator />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUnlink}
                  disabled={unlinking}
                  className="gap-2 text-destructive hover:text-destructive"
                >
                  <Unlink className="h-4 w-4" />
                  {unlinking ? 'Desvinculando...' : 'Desvincular Telegram'}
                </Button>
              </div>
            ) : profile?.telegramToken ? (
              /* ── Esperando vinculación ── */
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Esperando conexión... esta pantalla se actualizará sola.
                </div>

                {deepLink && (
                  <Button asChild className="w-full sm:w-auto gap-2">
                    <a href={deepLink} target="_blank" rel="noopener noreferrer">
                      <Send className="h-4 w-4" />
                      Abrir Telegram y conectar
                    </a>
                  </Button>
                )}

                <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    ¿No funciona el botón? Envía este mensaje a{' '}
                    <span className="font-medium">@{BOT_USERNAME}</span>:
                  </p>
                  <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                    <code className="flex-1 text-sm font-mono break-all">
                      /start {profile.telegramToken}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={copyToClipboard}
                      title="Copiar comando"
                    >
                      {copied ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              /* ── No conectado ── */
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Conecta tu cuenta de Telegram para chatear con tu asistente
                  contable: consultas de IGV, vencimientos SUNAT, dudas del PCGE
                  y enlaces seguros para subir comprobantes desde el celular.
                </p>
                <Button onClick={handleConnect} disabled={generating} className="gap-2">
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {generating ? 'Preparando...' : 'Conectar Telegram'}
                </Button>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
