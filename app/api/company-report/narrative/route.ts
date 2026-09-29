import { NextRequest, NextResponse } from 'next/server'
import { generateNarrative } from '@/lib/companyNarrative'
import { checkRateLimit, clientIp, rateLimitedPayload } from '@/lib/rateLimit'
import { getAuthedUserId } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
// Deliberately NOT edge — this only talks to api.anthropic.com (never
// blocked), and the AI call can take 15-30s, well past Edge's tighter
// execution limit. Regular serverless functions have a generous timeout.

export async function POST(req: NextRequest) {
  // This is the one route in the app that costs real money per call (a paid
  // Anthropic API request), so it gets the tightest limits of anything here —
  // a low per-minute burst cap plus a hard per-hour ceiling regardless of
  // burst pacing, since a single generated report never needs more than one
  // or two of these.
  const rl = await checkRateLimit('narrative', clientIp(req), [
    { limit: 4, windowMs: 60_000, label: 'burst' },
    { limit: 20, windowMs: 3_600_000, label: 'hourly' },
  ])
  if (!rl.ok) {
    const p = rateLimitedPayload(rl, 'Too many report requests — please wait a bit before generating another.')
    return NextResponse.json(p.body, { status: p.status, headers: p.headers })
  }

  // Must be a real, logged-in Supabase user — this route triggers a paid
  // Anthropic call and was previously reachable by anyone on the internet
  // with only a per-IP rate limit standing between them and your bill.
  const userId = await getAuthedUserId(req)
  if (!userId) return NextResponse.json({ error: 'You must be logged in to generate a report narrative.' }, { status: 401 })

  // A per-account daily ceiling on top of the per-IP limit above, so one
  // logged-in account can't rack up unlimited paid calls just by staying
  // under the burst/hourly pace.
  const userRl = await checkRateLimit('narrative-user', userId, [
    { limit: 15, windowMs: 86_400_000, label: 'daily' },
  ])
  if (!userRl.ok) {
    const p = rateLimitedPayload(userRl, "You've reached today's report-narrative limit for your account — please try again tomorrow.")
    return NextResponse.json(p.body, { status: p.status, headers: p.headers })
  }

  const bundle = await req.json().catch(() => null)
  if (!bundle || !bundle.overview) return NextResponse.json({ error: 'Missing report data.' }, { status: 400 })
  const narrative = await generateNarrative(bundle)
  return NextResponse.json({ narrative })
}
