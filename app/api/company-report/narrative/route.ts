import { NextRequest, NextResponse } from 'next/server'
import { generateNarrative } from '@/lib/companyNarrative'
import { checkRateLimit, clientIp, rateLimitedPayload } from '@/lib/rateLimit'
import { verifyUser, AUTH_REQUIRED_MESSAGE } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'
// Deliberately NOT edge — this only talks to api.anthropic.com (never
// blocked), and the AI call can take 15-30s, well past Edge's tighter
// execution limit. Regular serverless functions have a generous timeout.

// Keeps a hostile client from stuffing an arbitrarily large JSON blob into
// the AI prompt pipeline (cost + memory). Real report bundles are ~50KB.
const MAX_BODY_BYTES = 300_000

export async function POST(req: NextRequest) {
  // This route costs real money per call (a paid Anthropic API request), so
  // it requires a signed-in account and gets the tightest limits of anything
  // here — per-IP against anonymous probing, then per-user so one account
  // can't run up the bill from many IPs either.
  const ipLimit = await checkRateLimit('narrative', clientIp(req), [
    { limit: 4, windowMs: 60_000, label: 'burst' },
    { limit: 20, windowMs: 3_600_000, label: 'hourly' },
  ])
  if (!ipLimit.ok) {
    const p = rateLimitedPayload(ipLimit, 'Too many report requests — please wait a bit before generating another.')
    return NextResponse.json(p.body, { status: p.status, headers: p.headers })
  }
  const auth = await verifyUser(req)
  if (!auth) return NextResponse.json({ error: AUTH_REQUIRED_MESSAGE }, { status: 401 })
  const userLimit = await checkRateLimit('narrative-user', auth.userId, [
    { limit: 4, windowMs: 60_000, label: 'burst' },
    { limit: 20, windowMs: 3_600_000, label: 'hourly' },
  ])
  if (!userLimit.ok) {
    const p = rateLimitedPayload(userLimit, 'Too many report requests — please wait a bit before generating another.')
    return NextResponse.json(p.body, { status: p.status, headers: p.headers })
  }
  const rawBody = await req.text()
  if (rawBody.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Report data too large.' }, { status: 413 })
  const bundle = (() => { try { return JSON.parse(rawBody) } catch { return null } })()
  if (!bundle || !bundle.overview) return NextResponse.json({ error: 'Missing report data.' }, { status: 400 })
  const narrative = await generateNarrative(bundle)
  return NextResponse.json({ narrative })
}
