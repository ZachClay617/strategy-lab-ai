import { NextRequest, NextResponse } from 'next/server'
import {
  fetchQuoteSummary, fetchQuoteSummaryLite, fetchCompetitorSymbols, fetchNews, fetchDailyCandles,
  raw, dateStr, sma, rsi, macd, atr, periodReturn, NOT_REPORTED, UNAVAILABLE,
} from '@/lib/companyReport'

export const dynamic = 'force-dynamic'
// Vercel's regular serverless functions run on AWS Lambda IPs that Yahoo
// Finance's quoteSummary endpoint is blocking outright (confirmed via
// production logs: a valid crumb still gets a plain-text 429 "Too Many
// Requests" on the actual data request, not just the crumb endpoint). The
// Edge runtime egresses through a different network path that may not be
// on the same blocklist.
export const runtime = 'edge'

function last<T>(arr: T[]): T | null { return arr.length ? arr[arr.length - 1] : null }

async function buildCompetitor(sym: string) {
  const [qs, candles] = await Promise.all([fetchQuoteSummaryLite(sym), fetchDailyCandles(sym, 400)])
  if (!qs) return null
  const p = qs.price || {}, s = qs.summaryDetail || {}, k = qs.defaultKeyStatistics || {}, f = qs.financialData || {}
  const closes = candles.map(c => c.close)
  return {
    symbol: sym,
    name: p.longName || p.shortName || sym,
    price: raw(p.regularMarketPrice),
    marketCap: raw(p.marketCap),
    peRatio: raw(s.trailingPE),
    revenue: raw(f.totalRevenue),
    revenueGrowth: raw(f.revenueGrowth),
    grossMargin: raw(f.grossMargins),
    operatingMargin: raw(f.operatingMargins),
    netMargin: raw(f.profitMargins),
    freeCashFlow: raw(f.freeCashflow),
    totalDebt: raw(f.totalDebt),
    totalCash: raw(f.totalCash),
    oneYearReturn: periodReturn(closes, 252),
  }
}

const CRYPTO_NOT_SUPPORTED = (symbol: string) =>
  `Company Analysis Reports aren't available for cryptocurrencies. This report is built from real SEC filings, earnings, insider activity, and analyst estimates — none of that exists for "${symbol}", since it isn't a publicly traded company. Try a stock or ETF ticker instead.`

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') || '').trim().toUpperCase()
  if (!symbol) return NextResponse.json({ error: 'Provide a ticker symbol.' }, { status: 400 })
  // Yahoo lists every crypto pair as SYMBOL-USD (BTC-USD, ETH-USD, ...) — catch
  // the obvious case up front so we don't burn a quoteSummary fetch on it.
  if (/-(USD|USDT|USDC|EUR|GBP|BTC|ETH)$/i.test(symbol)) return NextResponse.json({ error: CRYPTO_NOT_SUPPORTED(symbol) }, { status: 400 })

  const [qs, candles5y, spyCandles5y, competitorSymbols, news] = await Promise.all([
    fetchQuoteSummary(symbol),
    fetchDailyCandles(symbol, 1825),
    fetchDailyCandles('SPY', 1825),
    fetchCompetitorSymbols(symbol),
    fetchNews(symbol),
  ])
  if (!qs) return NextResponse.json({ error: `Could not retrieve data for "${symbol}" right now. Either this isn't a recognized ticker, or the free Yahoo Finance data source is temporarily rate-limiting requests — wait a minute and try again.` }, { status: 404 })
  if (qs.price?.quoteType === 'CRYPTOCURRENCY') return NextResponse.json({ error: CRYPTO_NOT_SUPPORTED(symbol) }, { status: 400 })

  const competitors = (await Promise.all(competitorSymbols.map(buildCompetitor))).filter((c): c is NonNullable<typeof c> => c != null)

  const profile = qs.assetProfile || {}
  const price = qs.price || {}
  const summary = qs.summaryDetail || {}
  const stats = qs.defaultKeyStatistics || {}
  const fin = qs.financialData || {}
  const officers: any[] = profile.companyOfficers || []
  const ceo = officers.find(o => /chief executive/i.test(o.title || ''))
  const cfo = officers.find(o => /chief financial/i.test(o.title || ''))

  // ---------- 1. Overview ----------
  const overview = {
    name: price.longName || price.shortName || symbol,
    ticker: symbol,
    exchange: price.exchangeName || UNAVAILABLE,
    price: raw(price.regularMarketPrice),
    priceAsOf: dateStr(price.regularMarketTime) || new Date().toISOString().slice(0, 10),
    marketCap: raw(price.marketCap),
    sector: profile.sector || NOT_REPORTED,
    industry: profile.industry || NOT_REPORTED,
    hq: [profile.city, profile.state, profile.country].filter(Boolean).join(', ') || NOT_REPORTED,
    website: profile.website || NOT_REPORTED,
    employees: raw(profile.fullTimeEmployees) ?? (typeof profile.fullTimeEmployees === 'number' ? profile.fullTimeEmployees : null),
    ceo: ceo ? ceo.name : NOT_REPORTED,
    founded: NOT_REPORTED,
    businessSummary: profile.longBusinessSummary || NOT_REPORTED,
  }

  // ---------- 2. Competitive comparison (subject's own row) ----------
  const subjectRow = {
    symbol, name: overview.name, price: overview.price, marketCap: overview.marketCap,
    peRatio: raw(summary.trailingPE),
    revenue: raw(fin.totalRevenue), revenueGrowth: raw(fin.revenueGrowth),
    grossMargin: raw(fin.grossMargins), operatingMargin: raw(fin.operatingMargins), netMargin: raw(fin.profitMargins),
    freeCashFlow: raw(fin.freeCashflow), totalDebt: raw(fin.totalDebt), totalCash: raw(fin.totalCash),
    oneYearReturn: periodReturn(candles5y.map(c => c.close), 252),
  }

  // ---------- 7. Financial health ----------
  const yearly = qs.earnings?.earningsChart?.financialsChart?.yearly || qs.earnings?.financialsChart?.yearly || []
  const incomeHistory = (qs.incomeStatementHistory?.incomeStatementHistory || []).map((y: any) => ({
    endDate: dateStr(y.endDate), totalRevenue: raw(y.totalRevenue), netIncome: raw(y.netIncome),
  }))
  const revenueHistory = yearly.map((y: any) => ({
    year: y.date, revenue: raw(y.revenue), netIncome: raw(y.earnings), netMargin: raw(y.profitMargin),
  }))
  const financialHealth = {
    asOf: overview.priceAsOf,
    income: {
      revenueTTM: raw(fin.totalRevenue), revenueGrowth: raw(fin.revenueGrowth),
      grossProfitTTM: raw(fin.grossProfits), grossMargin: raw(fin.grossMargins),
      operatingMargin: raw(fin.operatingMargins), netMargin: raw(fin.profitMargins),
      netIncomeGrowth: raw(fin.earningsGrowth),
      epsTrailing: raw(stats.trailingEps), epsForward: raw(stats.forwardEps),
      revenueHistory: revenueHistory.length ? revenueHistory : (incomeHistory.length ? incomeHistory : NOT_REPORTED),
    },
    balanceSheet: {
      totalCash: raw(fin.totalCash), totalDebt: raw(fin.totalDebt),
      netDebt: raw(fin.totalDebt) != null && raw(fin.totalCash) != null ? raw(fin.totalDebt)! - raw(fin.totalCash)! : null,
      currentRatio: raw(fin.currentRatio), quickRatio: raw(fin.quickRatio),
      debtToEquity: raw(fin.debtToEquity), bookValuePerShare: raw(stats.bookValue),
      note: 'Full multi-year balance sheet line items are not available through this tool\'s free data sources; figures above are the latest reported snapshot.',
    },
    cashFlow: {
      operatingCashFlow: raw(fin.operatingCashflow), freeCashFlow: raw(fin.freeCashflow),
      fcfMargin: raw(fin.freeCashflow) != null && raw(fin.totalRevenue) ? raw(fin.freeCashflow)! / raw(fin.totalRevenue)! : null,
    },
  }

  // ---------- 8. Management & insiders ----------
  const management = {
    ceo: ceo ? { name: ceo.name, title: ceo.title, totalPay: raw(ceo.totalPay) } : NOT_REPORTED,
    cfo: cfo ? { name: cfo.name, title: cfo.title, totalPay: raw(cfo.totalPay) } : NOT_REPORTED,
    officers: officers.slice(0, 8).map(o => ({ name: o.name, title: o.title, totalPay: raw(o.totalPay) })),
    insiderOwnershipPct: raw(qs.majorHoldersBreakdown?.insidersPercentHeld),
    institutionalOwnershipPct: raw(qs.majorHoldersBreakdown?.institutionsPercentHeld),
    institutionsCount: raw(qs.majorHoldersBreakdown?.institutionsCount),
    sharesOutstanding: raw(stats.sharesOutstanding),
    recentInsiderHolders: (qs.insiderHolders?.holders || []).slice(0, 8).map((h: any) => ({
      name: h.name, relation: h.relation, transaction: h.transactionDescription,
      shares: raw(h.positionDirect), date: dateStr(h.latestTransDate),
    })),
    recentInsiderTransactions: (qs.insiderTransactions?.transactions || []).slice(0, 10).map((t: any) => ({
      filer: t.filerName, relation: t.filerRelation, text: t.transactionText,
      shares: raw(t.shares), value: raw(t.value), date: dateStr(t.startDate),
    })),
    netSharePurchaseActivity: qs.netSharePurchaseActivity ? {
      period: qs.netSharePurchaseActivity.period,
      buyCount: raw(qs.netSharePurchaseActivity.buyInfoCount), buyShares: raw(qs.netSharePurchaseActivity.buyInfoShares),
      sellCount: raw(qs.netSharePurchaseActivity.sellInfoCount), sellShares: raw(qs.netSharePurchaseActivity.sellInfoShares),
      netShares: raw(qs.netSharePurchaseActivity.netInfoShares),
    } : NOT_REPORTED,
  }

  // ---------- 9. News + analyst revisions ----------
  const analystRevisions = (qs.upgradeDowngradeHistory?.history || []).slice(0, 10).map((h: any) => ({
    firm: h.firm, action: h.action, fromGrade: h.fromGrade, toGrade: h.toGrade,
    priceTarget: h.currentPriceTarget, date: h.epochGradeDate ? new Date(h.epochGradeDate * 1000).toISOString().slice(0, 10) : null,
  }))
  const earningsSurprises = (qs.earnings?.earningsChart?.quarterly || []).map((q: any) => ({
    quarter: q.date, actual: raw(q.actual), estimate: raw(q.estimate), surprisePct: q.surprisePct ? Number(q.surprisePct) : null,
    reportedDate: dateStr(q.reportedDate),
  }))

  // ---------- 10. Catalysts ----------
  const cal = qs.calendarEvents || {}
  const catalysts = {
    nextEarningsDate: dateStr(cal.earnings?.earningsDate?.[0]) || NOT_REPORTED,
    earningsCallDate: dateStr(cal.earnings?.earningsCallDate?.[0]) || NOT_REPORTED,
    isEstimate: cal.earnings?.isEarningsDateEstimate ?? null,
    epsEstimateAvg: raw(cal.earnings?.earningsAverage), epsEstimateLow: raw(cal.earnings?.earningsLow), epsEstimateHigh: raw(cal.earnings?.earningsHigh),
    revenueEstimateAvg: raw(cal.earnings?.revenueAverage), revenueEstimateLow: raw(cal.earnings?.revenueLow), revenueEstimateHigh: raw(cal.earnings?.revenueHigh),
    exDividendDate: dateStr(cal.exDividendDate) || NOT_REPORTED,
    analystTargetMean: raw(fin.targetMeanPrice), analystTargetLow: raw(fin.targetLowPrice), analystTargetHigh: raw(fin.targetHighPrice),
    numberOfAnalysts: raw(fin.numberOfAnalystOpinions),
  }

  // ---------- 11. Technical analysis ----------
  const closes = candles5y.map(c => c.close)
  const sma20 = last(sma(closes, 20)), sma50 = last(sma(closes, 50)), sma100 = last(sma(closes, 100)), sma200 = last(sma(closes, 200))
  const oneYearCandles = candles5y.slice(-252)
  const week52High = oneYearCandles.length ? Math.max(...oneYearCandles.map(c => c.high)) : (raw(summary.fiftyTwoWeekHigh) ?? null)
  const week52Low = oneYearCandles.length ? Math.min(...oneYearCandles.map(c => c.low)) : (raw(summary.fiftyTwoWeekLow) ?? null)
  const recent20 = candles5y.slice(-20)
  const support = recent20.length ? Math.min(...recent20.map(c => c.low)) : null
  const resistance = recent20.length ? Math.max(...recent20.map(c => c.high)) : null
  const lastClose = last(closes)
  let trend: string = UNAVAILABLE
  if (lastClose != null && sma50 != null && sma200 != null) {
    if (lastClose > sma50 && sma50 > sma200) trend = 'Uptrend (price above the 50-day and 50-day above the 200-day average)'
    else if (lastClose < sma50 && sma50 < sma200) trend = 'Downtrend (price below the 50-day and 50-day below the 200-day average)'
    else trend = 'Mixed / consolidating (moving averages are not aligned in one direction)'
  }
  const spyCloses = spyCandles5y.map(c => c.close)
  const technicals = {
    price: lastClose, week52High, week52Low,
    sma20, sma50, sma100, sma200,
    rsi14: rsi(closes, 14), macd: macd(closes), atr14: atr(candles5y, 14),
    volume: raw(price.regularMarketVolume), avgVolume3M: raw(summary.averageDailyVolume3Month),
    relativeVolume: raw(price.regularMarketVolume) && raw(summary.averageDailyVolume3Month) ? raw(price.regularMarketVolume)! / raw(summary.averageDailyVolume3Month)! : null,
    support, resistance, trend,
    perfVsSpy: {
      oneMonth: { stock: periodReturn(closes, 21), spy: periodReturn(spyCloses, 21) },
      threeMonth: { stock: periodReturn(closes, 63), spy: periodReturn(spyCloses, 63) },
      oneYear: { stock: periodReturn(closes, 252), spy: periodReturn(spyCloses, 252) },
      threeYear: { stock: periodReturn(closes, 756), spy: periodReturn(spyCloses, 756) },
      fiveYear: { stock: periodReturn(closes, 1260), spy: periodReturn(spyCloses, 1260) },
    },
  }

  // ---------- 12. Shareholder returns ----------
  const shareholderReturns = {
    dividendYieldPct: raw(summary.dividendYield) != null ? raw(summary.dividendYield)! * 100 : null,
    dividendRate: raw(summary.dividendRate),
    payoutRatioPct: raw(summary.payoutRatio) != null ? raw(summary.payoutRatio)! * 100 : null,
    fiveYearAvgDividendYieldPct: raw(summary.fiveYearAvgDividendYield),
    exDividendDate: dateStr(summary.exDividendDate) || NOT_REPORTED,
    buybacksNote: 'Aggregate corporate buyback dollar amounts and historical share-count trends are not available through this tool\'s free data sources.',
    priceReturnVsSpy: technicals.perfVsSpy,
  }

  // ---------- 3. Customer growth (Yahoo does not publish subscriber/customer counts) ----------
  const customerGrowth = { status: NOT_REPORTED as string }

  const dataAsOf = new Date().toISOString()

  const bundle = {
    symbol, dataAsOf, overview, competitors: [subjectRow, ...competitors],
    customerGrowth, financialHealth, management,
    news: news.slice(0, 8), analystRevisions, earningsSurprises, catalysts, technicals, shareholderReturns,
  }

  // The AI narrative is generated by a separate, regular (non-Edge) route —
  // this Edge route only needs to survive Yahoo's IP block quickly, and the
  // AI call is slow enough on its own to blow Edge's execution time limit.
  return NextResponse.json(bundle)
}
