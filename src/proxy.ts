import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutos sin actividad

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  let user: { id: string } | null = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (!error) user = data.user
  } catch {
    // Refresh token inválido u otro error de red — sin sesión
  }

  const { pathname } = request.nextUrl
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/register')
  const isLanding = pathname === '/'
  const isPublicRoute = isLanding || isAuthRoute

  // ── Sin sesión ─────────────────────────────────────────────────────────────
  if (!user) {
    if (!isPublicRoute) {
      // Ruta protegida sin sesión → /login
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      const redirectRes = NextResponse.redirect(url)
      redirectRes.cookies.delete('sb-access-token')
      redirectRes.cookies.delete('sb-refresh-token')
      redirectRes.cookies.delete('last_active')
      return redirectRes
    }
    // Ruta pública sin sesión → mostrar normalmente
    return supabaseResponse
  }

  // ── Con sesión ─────────────────────────────────────────────────────────────
  const lastActive = request.cookies.get('last_active')?.value
  const now = Date.now()

  if (isLanding) {
    // Landing page con sesión:
    // - Si last_active existe y es reciente → el usuario está activo → /dashboard
    // - Si last_active ausente (browser cerrado ≥30 min) → sign out silencioso
    // - Si last_active existe pero expiró → sign out
    if (lastActive) {
      const elapsed = now - parseInt(lastActive, 10)
      if (elapsed > IDLE_TIMEOUT_MS) {
        // Sesión expirada por inactividad
        await supabase.auth.signOut()
        supabaseResponse.cookies.delete('last_active')
        return supabaseResponse
      }
      // Sesión válida: redirigir al dashboard
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    } else {
      // Sin last_active: el browser fue cerrado o la cookie expiró.
      // Sign out silencioso para que "Ya tengo cuenta" lleve al login real.
      await supabase.auth.signOut()
      return supabaseResponse
    }
  }

  if (isAuthRoute) {
    // En login/register con sesión activa → /dashboard
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // ── Rutas protegidas con sesión ────────────────────────────────────────────
  if (lastActive) {
    const elapsed = now - parseInt(lastActive, 10)
    if (elapsed > IDLE_TIMEOUT_MS) {
      await supabase.auth.signOut()
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('reason', 'idle')
      const redirectRes = NextResponse.redirect(url)
      redirectRes.cookies.delete('last_active')
      return redirectRes
    }
  }
  // Sin last_active en ruta protegida = recién se logeó → no cerrar sesión,
  // solo establecer el cookie para el tracking de inactividad.

  supabaseResponse.cookies.set('last_active', String(now), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: IDLE_TIMEOUT_MS / 1000,
  })

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Aplica a todas las rutas excepto:
     * - _next/static / _next/image / favicon.ico
     * - /upload/* (páginas públicas de upload con token)
     * - /api/* (todas las API routes responden JSON con 401/403,
     *   nunca 307 a /login — incluirlas causaba el bug de "no puedo subir imágenes")
     */
    '/((?!_next/static|_next/image|favicon.ico|upload|api).*)',
  ],
}
