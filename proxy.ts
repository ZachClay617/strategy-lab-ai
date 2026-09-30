import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Pages reachable without being logged in. Everything else under the site's
// normal page routes requires a session — this is checked here, server-side,
// before any page's own code runs, so a logged-out visit is redirected
// before that page's content is ever sent to the browser. (API routes have
// their own, separate auth — see lib/serverAuth.ts — and are excluded below
// so this never double-guards or interferes with them.)
const PUBLIC_PATHS = new Set(['/login', '/reset-password', '/terms', '/privacy', '/disclaimer', '/refunds'])

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  // No Supabase configured for this deployment — let pages render their own
  // "add Supabase environment variables" message rather than redirect-looping.
  if (!url || !key) return response

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // getUser() (not getSession()) so the token is actually revalidated against
  // Supabase here, not just decoded from a cookie that could be stale/forged.
  const { data: { user } } = await supabase.auth.getUser()

  if (pathname === '/') {
    return NextResponse.redirect(new URL(user ? '/home' : '/login', request.url))
  }

  if (!user && !PUBLIC_PATHS.has(pathname)) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/home', request.url))
  }

  return response
}

export const config = {
  // Everything except: Next's own static/image assets, the favicon, the
  // dynamically-generated /icon route, and all API routes (which have their
  // own, separate auth and must stay reachable by logged-out/unauthenticated
  // callers where that's intentional, e.g. /api/market).
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon).*)'],
}
