// Yahoo Finance's quoteSummary/quote/recommendation endpoints require a session
// cookie + "crumb" token (no API key, no account, entirely free) since they
// locked down unauthenticated access. Vercel's serverless functions are
// stateless and share IP ranges across many unrelated deployments, and Yahoo
// throttles those shared cloud IPs much harder than a normal residential IP —
// so re-fetching a crumb on every cold start quickly exhausts the shared
// quota. To avoid that, the crumb is cached both in memory (fastest, for a
// warm instance) and in Supabase (shared across every instance and cold
// start) for several hours before we ever ask Yahoo for a new one.
import { createClient } from '@supabase/supabase-js'

let cachedCookie: string | null = null
let cachedCrumb: string | null = null
let refreshing: Promise<void> | null = null
let lastAttempt = 0
const COOLDOWN_MS = 20000
const DB_CACHE_ID = 'default'
const DB_TTL_MS = 6 * 60 * 60 * 1000

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

function dbClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function loadFromDb(): Promise<{ cookie: string | null; crumb: string } | null> {
  const admin = dbClient()
  if (!admin) return null
  try {
    const { data } = await admin.from('yahoo_auth_cache').select('cookie,crumb,updated_at').eq('id', DB_CACHE_ID).maybeSingle()
    if (data?.crumb && Date.now() - new Date(data.updated_at).getTime() < DB_TTL_MS) {
      return { cookie: data.cookie, crumb: data.crumb }
    }
  } catch { /* table may not exist yet — fall through to a live fetch */ }
  return null
}

async function saveToDb(cookie: string | null, crumb: string) {
  const admin = dbClient()
  if (!admin) return
  try {
    await admin.from('yahoo_auth_cache').upsert({ id: DB_CACHE_ID, cookie, crumb, updated_at: new Date().toISOString() })
  } catch { /* non-fatal — in-memory cache still works for this instance */ }
}

async function attemptFetch(): Promise<boolean> {
  const cookieRes = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual', cache: 'no-store' })
  const setCookie = cookieRes.headers.get('set-cookie')
  const cookie = setCookie ? setCookie.split(';')[0] : null
  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, ...(cookie ? { cookie } : {}) },
    cache: 'no-store',
  })
  const crumb = (await crumbRes.text()).trim()
  const looksValid = crumb && crumb.length < 40 && !/[\s<>{}]/.test(crumb)
  if (!looksValid) { console.error('[yahooAuth] could not get a usable crumb (status', crumbRes.status, ') — Yahoo Finance may be temporarily rate-limiting this server.'); return false }
  cachedCookie = cookie
  cachedCrumb = crumb
  await saveToDb(cookie, crumb)
  return true
}

// A single 429 is common on shared cloud IPs, but it's often not persistent —
// a couple of quick retries with jitter gives one user click a real shot at
// getting through and seeding the shared Supabase cache for everyone else.
async function fetchFreshFromYahoo() {
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await attemptFetch()) return
      if (attempt < 2) await new Promise(r => setTimeout(r, 400 + Math.random() * 600))
    }
  } catch (e) {
    console.error('[yahooAuth] refresh threw', e)
  }
}

async function refresh(skipDb: boolean) {
  if (!skipDb) {
    const fromDb = await loadFromDb()
    if (fromDb) { cachedCookie = fromDb.cookie; cachedCrumb = fromDb.crumb; return }
  }
  await fetchFreshFromYahoo()
}

export async function getYahooAuth(opts: { skipDb?: boolean } = {}): Promise<{ cookie: string | null; crumb: string | null }> {
  if (!cachedCrumb && Date.now() - lastAttempt > COOLDOWN_MS) {
    lastAttempt = Date.now()
    if (!refreshing) refreshing = refresh(!!opts.skipDb).finally(() => { refreshing = null })
    await refreshing
  } else if (refreshing) {
    await refreshing
  }
  return { cookie: cachedCookie, crumb: cachedCrumb }
}

export async function yahooFetch(url: string, opts: { forceFreshAuth?: boolean } = {}): Promise<any> {
  if (opts.forceFreshAuth) { cachedCookie = null; cachedCrumb = null; lastAttempt = 0 }
  const { cookie, crumb } = await getYahooAuth({ skipDb: opts.forceFreshAuth })
  const sep = url.includes('?') ? '&' : '?'
  const finalUrl = crumb ? `${url}${sep}crumb=${encodeURIComponent(crumb)}` : url
  const r = await fetch(finalUrl, { headers: { 'User-Agent': UA, ...(cookie ? { cookie } : {}) }, cache: 'no-store' })
  const rawText = await r.text()
  const j = (() => { try { return JSON.parse(rawText) } catch { return null } })()
  if (!j) console.error('[yahooAuth] non-JSON response from', url.split('?')[0], '— status', r.status, 'body:', rawText.slice(0, 300))
  const unauthorized = j?.finance?.error?.code === 'Unauthorized' || j?.quoteSummary?.error?.code === 'Unauthorized'
  if (unauthorized && !opts.forceFreshAuth) return yahooFetch(url, { forceFreshAuth: true })
  return j
}
