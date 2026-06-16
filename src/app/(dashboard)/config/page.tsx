'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { CheckCircle, Copy, Unlink, Send, Loader2, QrCode, Smartphone } from 'lucide-react'
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

function QRCodeDisplay({ deepLink }: { deepLink: string }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&data=${encodeURIComponent(deepLink)}`
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-xl border bg-white p-2 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrUrl} alt="QR para conectar con Telegram" width={160} height={160} className="block rounded-md" />
      </div>
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Smartphone className="h-3 w-3" />
        Escanea con la cámara de tu celular
      </p>
    </div>
  )
}

export default function ConfigPage() {
  const [profile, setProfile] = useState<ProfileState | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showQR, setShowQR] = useState(true)
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
      telegramId: data.telegram_id ?? null,
      telegramToken: data.telegram_token ?? null,
    }
  }, [])

  useEffect(() => {
    loadProfile().then((p) => {
      setProfile(p)
      setLoading(false)
    })
  }, [loadProfile])

  // Mientras hay código pendiente: detectar vinculación por polling + evento de foco.
  // El evento visibilitychange dispara en cuanto el usuario regresa de la app de
  // Telegram al browser, consiguiendo una actualización casi inmediata sin esperar
  // el próximo tick del intervalo de 2s.
  useEffect(() => {
    const waiting = !profile?.telegramId && !!profile?.telegramToken
    if (!waiting) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }

    async function checkProfile() {
      const fresh = await loadProfile()
      // Siempre actualizar el estado si el perfil existe — no solo cuando
      // telegramId es truthy, para cubrir el caso donde el webhook borró
      // telegram_token antes de que el cliente detecte el telegram_id.
      if (fresh !== null) {
        setProfile(fresh)
      }
    }

    // Poll cada 2 s (era 4 s) mientras espera conexión
    pollRef.current = setInterval(checkProfile, 2000)

    // Detectar regreso desde Telegram inmediatamente (sin esperar el intervalo)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkProfile()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', checkProfile)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', checkProfile)
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
        setShowQR(true)
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
        .update({ telegram_id: null, telegram_token: null })
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
        <p className="text-sm text-muted-foreground">Gestiona tu cuenta y vinculaciones</p>
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
                <div className="flex items-center gap-3 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
                  <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-800">Conectado con @{BOT_USERNAME}</p>
                    <p className="text-xs text-green-700 mt-0.5">
                      Puedes chatear o enviar notas de voz con tu asistente contable.
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Pregunta sobre IGV del mes, vencimientos SUNAT, dudas del PCGE,
                  o escribe <code className="text-xs bg-muted px-1 rounded">subir factura</code> para un enlace de 15 min.
                  También puedes enviar <b>notas de voz</b> de hasta 30 segundos.
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
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  Esperando que conectes en Telegram...
                </div>

                <div className="flex gap-2">
                  <Button variant={showQR ? 'default' : 'outline'} size="sm" onClick={() => setShowQR(true)} className="gap-1.5">
                    <QrCode className="h-3.5 w-3.5" />
                    QR
                  </Button>
                  <Button variant={!showQR ? 'default' : 'outline'} size="sm" onClick={() => setShowQR(false)} className="gap-1.5">
                    <Send className="h-3.5 w-3.5" />
                    Enlace
                  </Button>
                </div>

                {showQR && deepLink ? (
                  <div className="flex flex-col sm:flex-row items-start gap-6">
                    <QRCodeDisplay deepLink={deepLink} />
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">¿Cómo conectar?</p>
                      <ol className="space-y-1.5 list-decimal list-inside text-sm">
                        <li>Abre la cámara de tu celular</li>
                        <li>Apunta al código QR</li>
                        <li>Toca el enlace que aparece</li>
                        <li>Telegram se abre con el bot listo</li>
                        <li>Pulsa <strong>START</strong></li>
                      </ol>
                      <p className="text-xs pt-1">Esta página se actualizará automáticamente.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
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
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copyToClipboard} title="Copiar">
                          {copied ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ── No conectado ── */
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Conecta tu Telegram para chatear con tu asistente contable: IGV del mes,
                  vencimientos SUNAT, dudas PCGE, notas de voz y enlaces para subir comprobantes.
                </p>
                <Button onClick={handleConnect} disabled={generating} className="gap-2">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                  {generating ? 'Preparando QR...' : 'Conectar Telegram'}
                </Button>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
