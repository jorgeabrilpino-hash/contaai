'use client'

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, Copy, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'

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

  const loadProfile = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('profiles')
      .select('telegram_id, telegram_token')
      .eq('id', user.id)
      .single()

    if (data) {
      setProfile({
        telegramId: data.telegram_id,
        telegramToken: data.telegram_token,
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  async function handleGenerateToken() {
    setGenerating(true)
    setError(null)
    const res = await fetch('/api/telegram/generate-token', { method: 'POST' })
    const json = await res.json()
    if (res.ok && json.token) {
      setProfile(prev => prev ? { ...prev, telegramToken: json.token } : prev)
    } else {
      setError(json.error ?? 'Error al generar el código.')
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
        setProfile(prev => prev ? { ...prev, telegramId: null } : prev)
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

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Gestiona tu cuenta y vinculaciones
        </p>
      </div>

      <div className="p-6 max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span>🤖</span>
              Vincular Telegram
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-9 w-40" />
              </div>
            ) : profile?.telegramId ? (
              /* ── Vinculado ── */
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                  <span className="text-sm font-medium text-green-700">
                    Cuenta vinculada
                  </span>
                  <Badge variant="secondary" className="font-mono text-xs">
                    ID: {profile.telegramId}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Puedes consultar el IGV del mes, ver documentos pendientes y
                  generar enlaces de subida directamente desde Telegram.
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
            ) : (
              /* ── No vinculado ── */
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Vincula tu cuenta de Telegram para recibir notificaciones
                  cuando llegan documentos y consultar datos desde el bot.
                </p>

                {profile?.telegramToken ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                        Código de vinculación
                      </p>
                      <p className="text-3xl font-bold font-mono tracking-widest">
                        {profile.telegramToken}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Envía este mensaje al bot de ContaAI en Telegram:
                      </p>
                      <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                        <code className="flex-1 text-sm font-mono">
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateToken}
                      disabled={generating}
                    >
                      {generating ? 'Generando...' : 'Regenerar código'}
                    </Button>
                  </div>
                ) : (
                  <Button onClick={handleGenerateToken} disabled={generating}>
                    {generating ? 'Generando...' : 'Generar código de vinculación'}
                  </Button>
                )}
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
