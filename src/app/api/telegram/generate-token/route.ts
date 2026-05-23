import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(): Promise<NextResponse> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 6-char alphanumeric code
  const token = Math.random().toString(36).slice(2, 8).toUpperCase()

  const { error } = await supabase
    .from('profiles')
    .update({ telegram_token: token })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: 'Error al generar el token' }, { status: 500 })
  }

  return NextResponse.json({ token })
}
