import { NextRequest, NextResponse } from 'next/server'
import { generateNarrative } from '@/lib/companyNarrative'
import { checkRateLimit, clientIp, rateLimitedPayload } from '@/lib/rateLimit'
import { getAuthedUserId } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
// Deliberately NOT edge — this only talks to api.anthropic.com (never
// blocked), and the AI call can take 15-30s, well past Edge's tighter
// execution limit. Regular serverless functions have a generous timeout.

// Keeps a hostile client from stuffing an arbitrarily large JSON blob into
// the AI prompt pipeline (cost + memory). Real report bundles are ~50KB.
const MAX_BODY_BYTES = 300_000

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
  if (!bundle || !bundle.overview) return NextResponse.json({ error: 'Missing report data.' }, { status: 400 })
  if (JSON.stringify(bundle).length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Report data too large.' }, { status: 413 })
  const narrative = await generateNarrative(bundle)
  return NextResponse.json({ narrative })
}
