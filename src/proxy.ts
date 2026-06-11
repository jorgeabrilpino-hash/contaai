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

  // getUser() refresca el token automáticamente.
  // Si el refresh_token es inválido (cookies viejas/expiradas), lo capturamos
  // y tratamos como sesión no autenticada — evita el error en logs.
  let user: { id: string } | null = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (!error) user = data.user
  } catch {
    // Refresh token inválido u otro error de red — se trata como sin sesión
  }

  const { pathname } = request.nextUrl

  const isAuthRoute =
    pathname.startsWith('/login') || pathname.startsWith('/register')

  // "/" es pública (landing page) — no requiere autenticación
  const isPublicRoute = pathname === '/' || isAuthRoute

  // Sin sesión y tratando de acceder a ruta protegida → /login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Limpiar cookies de sesión inválidas para no generar errores en bucle
    const redirectRes = NextResponse.redirect(url)
    redirectRes.cookies.delete('sb-access-token')
    redirectRes.cookies.delete('sb-refresh-token')
    redirectRes.cookies.delete('last_active')
    return redirectRes
  }

  // Con sesión y en ruta de auth → dashboard
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Idle timeout: cerrar sesión automáticamente tras 30 min de inactividad
  if (user && !isPublicRoute) {
    const lastActive = request.cookies.get('last_active')?.value
    const now = Date.now()

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

    // Actualizar timestamp de última actividad en cada request
    supabaseResponse.cookies.set('last_active', String(now), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: IDLE_TIMEOUT_MS / 1000,
    })
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Aplica a todas las rutas excepto:
     * - _next/static (archivos estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico
     * - /upload/* (páginas públicas de upload con token)
     * - /api/* (TODAS las API routes: validan auth por sí mismas y deben
     *   responder JSON con 401/403 — un redirect 307 a /login rompe los
     *   fetch del cliente, p.ej. la subida de documentos)
     */
    '/((?!_next/static|_next/image|favicon.ico|upload|api).*)',
  ],
}
