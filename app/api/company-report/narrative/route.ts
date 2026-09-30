import { NextRequest, NextResponse } from 'next/server'
import { generateNarrative } from '@/lib/companyNarrative'
import { GLOBAL_AI_DAILY_LIMIT, checkRateLimit, clientIp, rateLimitedPayload } from '@/lib/rateLimit'
import { getAuthedUserId } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
// Deliberately NOT edge — this only talks to api.anthropic.com (never
// blocked), and the AI call can take 15-30s, well past Edge's tighter
// execution limit. Regular serverless functions have a generous timeout.

// Keeps a hostile client from stuffing an arbitrarily large JSON blob into
// the AI prompt pipeline (cost + memory). Real report bundles are ~50KB.
const MAX_BODY_BYTES = 300_000

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function isReportBundle(b: unknown): boolean {
  if (!isObject(b)) return false
  if (typeof b.symbol !== 'string') return false
  for (const key of ['overview', 'financialHealth', 'management', 'catalysts', 'technicals', 'shareholderReturns', 'customerGrowth']) {
    if (!isObject(b[key])) return false
  }
  if (!isObject((b.financialHealth as Record<string, unknown>).income)) return false
  if (!Array.isArray((b.management as Record<string, unknown>).recentInsiderTransactions)) return false
  if (!Array.isArray(b.competitors) || !Array.isArray(b.news)) return false
  return true
}

export async function POST(req: NextRequest) {
  // This route costs real money per call (a paid Anthropic API request), so
  // it gets the tightest limits of anything here: a per-IP cap against
  // anonymous probing, a required login, and a per-account daily ceiling so
  // one account can't run up the bill from many IPs either.
  const ipLimit = await checkRateLimit('narrative', clientIp(req), [
    { limit: 4, windowMs: 60_000, label: 'burst' },
    { limit: 20, windowMs: 3_600_000, label: 'hourly' },
  ])
  if (!ipLimit.ok) {
    const p = rateLimitedPayload(ipLimit, 'Too many report requests — please wait a bit before generating another.')
    return NextResponse.json(p.body, { status: p.status, headers: p.headers })
  }

  const userId = await getAuthedUserId(req)
  if (!userId) return NextResponse.json({ error: 'You must be logged in to generate a report narrative.' }, { status: 401 })

  const userRl = await checkRateLimit('narrative-user', userId, [
    { limit: 10, windowMs: 86_400_000, label: 'daily' },
  ])
  if (!userRl.ok) {
    const p = rateLimitedPayload(userRl, "You've reached today's report-narrative limit for your account — please try again tomorrow.")
    return NextResponse.json(p.body, { status: p.status, headers: p.headers })
  }

  const bundle = await req.json().catch(() => null)
  // The body is whatever the caller sent, and both the AI prompt builder and
  // the template fallback walk deep into it (bundle.competitors[0],
  // bundle.catalysts.numberOfAnalysts, bundle.technicals.trend, …). Checking
  // only `overview` meant a body like {"overview":{}} threw a TypeError out of
  // the handler — a 500 with an HTML body that the page reported as
  // "Unexpected token <" — after the caller's daily quota was already spent.
  // Every section /api/company-report itself emits is required here.
  if (!isReportBundle(bundle)) return NextResponse.json({ error: 'Missing or malformed report data.' }, { status: 400 })
  if (JSON.stringify(bundle).length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Report data too large.' }, { status: 413 })
  // Last gate before spending money. Registration is free and self-serve, so
  // the per-account cap above bounds one account, not the bill: a script with
  // N throwaway accounts just multiplies it. This caps the deployment as a
  // whole for the day.
  const globalRl = await checkRateLimit('narrative-global', 'all', [
    { limit: GLOBAL_AI_DAILY_LIMIT, windowMs: 86_400_000, label: 'global-daily' },
  ])
  if (!globalRl.ok) {
    const p = rateLimitedPayload(globalRl, 'Report narratives are temporarily paused — this service has hit its daily capacity. Please try again tomorrow.')
    return NextResponse.json(p.body, { status: p.status, headers: p.headers })
  }

  const narrative = await generateNarrative(bundle)
  return NextResponse.json({ narrative })
}
