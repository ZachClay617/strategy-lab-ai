// Yahoo Finance's quoteSummary/quote/recommendation endpoints require a session
// cookie + "crumb" token (no API key, no account, entirely free) since they
// locked down unauthenticated access. This caches both in memory for the life
// of the server process and refreshes them if a request comes back Unauthorized.
let cachedCookie: string | null = null
let cachedCrumb: string | null = null
let refreshing: Promise<void> | null = null
let lastAttempt = 0
const COOLDOWN_MS = 20000

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

async function refresh(){
  try{
    const cookieRes = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual', cache: 'no-store' })
    const setCookie = cookieRes.headers.get('set-cookie')
    const cookie = setCookie ? setCookie.split(';')[0] : null
    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, ...(cookie ? { cookie } : {}) },
      cache: 'no-store',
    })
    const crumb = (await crumbRes.text()).trim()
    const looksValid = crumb && crumb.length < 40 && !/[\s<>{}]/.test(crumb)
    if (!looksValid) console.error('[yahooAuth] could not get a usable crumb (status', crumbRes.status, ') — Yahoo Finance may be temporarily rate-limiting this server.')
    if (looksValid) {
      cachedCookie = cookie
      cachedCrumb = crumb
    }
  }catch(e){
    console.error('[yahooAuth] refresh threw', e)
  }
}

export async function getYahooAuth(): Promise<{ cookie: string | null; crumb: string | null }> {
  if (!cachedCrumb && Date.now() - lastAttempt > COOLDOWN_MS) {
    lastAttempt = Date.now()
    if (!refreshing) refreshing = refresh().finally(() => { refreshing = null })
    await refreshing
  } else if (refreshing) {
    await refreshing
  }
  return { cookie: cachedCookie, crumb: cachedCrumb }
}

export async function yahooFetch(url: string, opts: { forceFreshAuth?: boolean } = {}): Promise<any> {
  if (opts.forceFreshAuth) { cachedCookie = null; cachedCrumb = null; lastAttempt = 0 }
  const { cookie, crumb } = await getYahooAuth()
  const sep = url.includes('?') ? '&' : '?'
  const finalUrl = crumb ? `${url}${sep}crumb=${encodeURIComponent(crumb)}` : url
  const r = await fetch(finalUrl, { headers: { 'User-Agent': UA, ...(cookie ? { cookie } : {}) }, cache: 'no-store' })
  const j = await r.json().catch(() => null)
  const unauthorized = j?.finance?.error?.code === 'Unauthorized' || j?.quoteSummary?.error?.code === 'Unauthorized'
  if (unauthorized && !opts.forceFreshAuth) return yahooFetch(url, { forceFreshAuth: true })
  return j
}
