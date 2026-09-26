import { NextRequest, NextResponse } from 'next/server'
import { generateNarrative } from '@/lib/companyNarrative'

export const dynamic = 'force-dynamic'
// Deliberately NOT edge — this only talks to api.anthropic.com (never
// blocked), and the AI call can take 15-30s, well past Edge's tighter
// execution limit. Regular serverless functions have a generous timeout.

export async function POST(req: NextRequest) {
  const bundle = await req.json().catch(() => null)
  if (!bundle || !bundle.overview) return NextResponse.json({ error: 'Missing report data.' }, { status: 400 })
  const narrative = await generateNarrative(bundle)
  return NextResponse.json({ narrative })
}
