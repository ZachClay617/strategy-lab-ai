import { yahooFetch } from './yahooAuth'
import { fetchCandles, type Candle } from './market'

const UA = 'StrategyLabAI/3.0'
export const NOT_REPORTED = 'Not publicly reported'
export const UNAVAILABLE = 'Data unavailable'

// ---------- Yahoo "raw"/"fmt" helpers ----------
export function raw(x: any): number | null {
  if (x == null) return null
  if (typeof x === 'number') return x
  if (typeof x === 'object' && typeof x.raw === 'number') return x.raw
  return null
}
export function fmtStr(x: any): string | null {
  if (x == null) return null
  if (typeof x === 'object' && typeof x.fmt === 'string') return x.fmt
  return null
}
export function dateStr(x: any): string | null {
  const r = raw(x)
  return r ? new Date(r * 1000).toISOString().slice(0, 10) : null
}

// ---------- quoteSummary ----------
const MODULES = [
  'assetProfile', 'summaryDetail', 'defaultKeyStatistics', 'financialData', 'price',
  'incomeStatementHistory', 'calendarEvents', 'insiderHolders', 'insiderTransactions',
  'netSharePurchaseActivity', 'majorHoldersBreakdown', 'upgradeDowngradeHistory',
  'recommendationTrend', 'earnings',
].join(',')

export async function fetchQuoteSummary(symbol: string): Promise<any | null> {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${MODULES}`
  const j = await yahooFetch(url)
  return j?.quoteSummary?.result?.[0] || null
}

// Lighter-weight fetch used for competitor comparisons (fewer modules, faster).
export async function fetchQuoteSummaryLite(symbol: string): Promise<any | null> {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price,summaryDetail,defaultKeyStatistics,financialData`
  const j = await yahooFetch(url)
  return j?.quoteSummary?.result?.[0] || null
}

export async function fetchCompetitorSymbols(symbol: string): Promise<string[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v6/finance/recommendationsbysymbol/${encodeURIComponent(symbol)}`
    const j = await yahooFetch(url)
    const list = j?.finance?.result?.[0]?.recommendedSymbols || []
    return list.map((x: any) => x.symbol).filter(Boolean).slice(0, 5)
  } catch { return [] }
}

export type NewsItem = { title: string; link: string; pubDate: string; description: string }
export async function fetchNews(symbol: string): Promise<NewsItem[]> {
  try {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`
    const r = await fetch(url, { headers: { 'User-Agent': UA }, cache: 'no-store' })
    const xml = await r.text()
    const items: NewsItem[] = []
    const blocks = xml.split('<item>').slice(1)
    for (const b of blocks.slice(0, 12)) {
      const grab = (tag: string) => {
        const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))
        return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''
      }
      const title = grab('title'), link = grab('link'), pubDate = grab('pubDate'), description = grab('description')
      if (title && link) items.push({ title, link, pubDate, description })
    }
    return items
  } catch { return [] }
}

// ---------- Technical indicators (computed from real historical closes) ----------
export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = []
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(null); continue }
    let sum = 0
    for (let k = i - period + 1; k <= i; k++) sum += values[k]
    out.push(sum / period)
  }
  return out
}

export function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null
  let gains = 0, losses = 0
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1]
    if (diff >= 0) gains += diff; else losses -= diff
  }
  const avgGain = gains / period, avgLoss = losses / period
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const out: number[] = [values[0]]
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k))
  return out
}

export function macd(values: number[]): { macd: number; signal: number; histogram: number } | null {
  if (values.length < 35) return null
  const ema12 = ema(values, 12), ema26 = ema(values, 26)
  const macdLine = values.map((_, i) => ema12[i] - ema26[i])
  const signalLine = ema(macdLine.slice(-Math.min(macdLine.length, 100)), 9)
  const last = macdLine[macdLine.length - 1]
  const lastSignal = signalLine[signalLine.length - 1]
  return { macd: last, signal: lastSignal, histogram: last - lastSignal }
}

export function atr(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null
  const trs: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1]
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)))
  }
  const last = trs.slice(-period)
  return last.reduce((a, b) => a + b, 0) / last.length
}

export function periodReturn(closes: number[], tradingDays: number): number | null {
  if (closes.length < 2) return null
  const idx = Math.max(0, closes.length - 1 - tradingDays)
  if (idx === closes.length - 1) return null
  return (closes[closes.length - 1] / closes[idx] - 1) * 100
}

export async function fetchDailyCandles(symbol: string, rangeDays: number): Promise<Candle[]> {
  const result = await fetchCandles(symbol, { interval: '1d', rangeDays })
  return 'candles' in result ? result.candles : []
}
