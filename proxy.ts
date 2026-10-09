import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Pages reachable without being logged in. Everything else under the site's
// normal page routes requires a session — this is checked here, server-side,
// before any page's own code runs, so a logged-out visit is redirected
// before that page's content is ever sent to the browser. (API routes have
// their own, separate auth — see lib/serverAuth.ts — and are excluded below
// so this never double-guards or interferes with them.)
const PUBLIC_PATHS = new Set(['/login', '/reset-password', '/terms', '/privacy', '/disclaimer', '/refunds'])

// How long a page request waits on Supabase to confirm the session. It
// normally answers in well under a second; without a limit, a slow or
// unreachable Supabase would leave every page spinning until the hosting
// platform's own request timeout (minutes) with no explanation.
const AUTH_TIMEOUT_MS = 8000
const TIMED_OUT = Symbol('timed out')

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<typeof TIMED_OUT>(resolve => { timer = setTimeout(() => resolve(TIMED_OUT), ms) })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// Self-contained (no app code or assets) so it renders even while the
// session check is the thing that's failing. "Try again" reloads the page.
const UNAVAILABLE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Temporarily unavailable | Strategy Lab AI</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:#0b0d12;color:#e8eaf0;font-family:system-ui,sans-serif;text-align:center"><main><h1 style="font-size:22px;margin:0 0 8px">Strategy Lab AI is taking longer than usual</h1><p style="margin:0 0 20px;color:#9aa3b2">We couldn't confirm your login just now. This is usually brief.</p><a href="" style="color:#7dd3fc;font-weight:600">Try again</a></main></body></html>`

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
  const auth = await withTimeout(supabase.auth.getUser(), AUTH_TIMEOUT_MS)
  if (auth === TIMED_OUT) {
    console.error(`proxy: Supabase session check took longer than ${AUTH_TIMEOUT_MS}ms on ${pathname}`)
    // Public pages don't depend on who's logged in, so they still load.
    if (PUBLIC_PATHS.has(pathname)) return response
    // Everything else stays closed (no content without a confirmed session),
    // but with a clear message instead of an endless spinner.
    return new NextResponse(UNAVAILABLE_HTML, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '30', 'Cache-Control': 'no-store' },
    })
  }
  const { data: { user } } = auth

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
