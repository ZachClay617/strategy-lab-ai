import { NextRequest, NextResponse } from 'next/server'
import { generateNarrative } from '@/lib/companyNarrative'
import { checkRateLimit, clientIp, rateLimitedPayload } from '@/lib/rateLimit'

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
  const bundle = await req.json().catch(() => null)
  if (!bundle || !bundle.overview) return NextResponse.json({ error: 'Missing report data.' }, { status: 400 })
  const narrative = await generateNarrative(bundle)
  return NextResponse.json({ narrative })
}
