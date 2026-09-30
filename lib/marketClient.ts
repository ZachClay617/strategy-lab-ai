// Browser-side helpers for talking to /api/market.
import type { Candle } from './market'

// The route caps one ?names= request at 20 symbols, because each symbol costs
// one upstream request. Asking for more than that used to silently drop the
// overflow — a portfolio or watchlist past the cap would show some rows
// without a company name and never retry. Split into batches instead.
const NAMES_PER_REQUEST = 20

export async function fetchSymbolNames(symbols: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(symbols.filter(Boolean)))
  if (!unique.length) return {}
  const batches: string[][] = []
  for (let i = 0; i < unique.length; i += NAMES_PER_REQUEST) batches.push(unique.slice(i, i + NAMES_PER_REQUEST))
  const results = await Promise.all(batches.map(async batch => {
    try {
      const r = await fetch(`/api/market?names=${encodeURIComponent(batch.join(','))}`)
      const j = await r.json()
      return j && typeof j === 'object' && !Array.isArray(j) ? j as Record<string, string> : {}
    } catch { return {} }
  }))
  return Object.assign({}, ...results)
}

// Per-bar-size history for the live signal checks the Trade Signals page runs
// while it is open. It must go through /api/market: lib/market.ts talks to the
// data provider directly, which the app's Content-Security-Policy
// (`connect-src 'self' <supabase>`) blocks in the browser, and the provider
// sends no CORS headers either. Matches the TierCandleFetcher signature in
// lib/strategySignals.ts.
export async function fetchTierCandlesViaApi(symbol: string, interval: string, rangeDays: number): Promise<Candle[]> {
  try {
    const r = await fetch(`/api/market?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&rangeDays=${rangeDays}`)
    const j = await r.json()
    return Array.isArray(j) ? j as Candle[] : []
  } catch { return [] }
}
