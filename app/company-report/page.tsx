'use client'
import { useState } from 'react'

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return 'Data unavailable'
  const abs = Math.abs(n)
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}
function fmtPct(n: number | null | undefined, alreadyPct = false): string {
  if (n == null) return 'Data unavailable'
  const v = alreadyPct ? n : n * 100
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}
function fmtNum(n: number | null | undefined): string {
  if (n == null) return 'Data unavailable'
  return n.toLocaleString()
}
function isMissing(v: any): boolean {
  return v == null || v === 'Not publicly reported' || v === 'Data unavailable'
}
function Val({ v, money: isMoney, pct: isPct, alreadyPct }: { v: any; money?: boolean; pct?: boolean; alreadyPct?: boolean }) {
  if (isMissing(v)) return <span className="muted">{typeof v === 'string' ? v : 'Data unavailable'}</span>
  if (isMoney) return <>{fmtMoney(v)}</>
  if (isPct) return <span className={v >= 0 || (alreadyPct && v >= 0) ? 'up' : 'down'}>{fmtPct(v, alreadyPct)}</span>
  return <>{typeof v === 'number' ? fmtNum(v) : v}</>
}

function RevenueChart({ history }: { history: any[] }) {
  const rows = (history || []).filter(h => h.revenue != null)
  if (rows.length < 2) return <div className="chart empty">Not enough historical revenue data to chart.</div>
  const w = 1000, h = 260, padL = 70, padR = 16, padT = 20, padB = 34
  const max = Math.max(...rows.map(r => r.revenue))
  const x = (i: number) => padL + (i / Math.max(rows.length - 1, 1)) * (w - padL - padR)
  const barW = (w - padL - padR) / rows.length * 0.5
  return <div className="chart-wrap rh">
    <div className="chart-head"><div><b>Revenue &amp; Net Income by Year</b><span>ANNUAL, REAL REPORTED FIGURES</span></div></div>
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {rows.map((r, i) => {
        const barH = (r.revenue / max) * (h - padT - padB)
        const niH = r.netIncome != null ? (Math.max(r.netIncome, 0) / max) * (h - padT - padB) : 0
        return <g key={i}>
          <rect x={x(i) - barW / 2} y={h - padB - barH} width={barW * 0.55} height={barH} fill="#57e8ff" opacity={0.85} />
          {r.netIncome != null && <rect x={x(i) - barW / 2 + barW * 0.6} y={h - padB - niH} width={barW * 0.55} height={niH} fill="#8b72ff" opacity={0.85} />}
          <text x={x(i)} y={h - 10} fill="#6b7690" fontSize="11" textAnchor="middle">{r.endDate ? r.endDate.slice(0, 4) : r.year}</text>
        </g>
      })}
      <text x={padL - 8} y={padT + 4} fill="#6b7690" fontSize="11" textAnchor="end">{fmtMoney(max)}</text>
    </svg>
    <p className="tiny">Cyan = revenue, purple = net income.</p>
  </div>
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return <div className="table" style={{ overflowX: 'auto' }}>
    <div className="row row-head" style={{ gridTemplateColumns: head.map(() => 'minmax(0,1fr)').join(' ') }}>
      {head.map((h, i) => <span key={i}>{h}</span>)}
    </div>
    {rows.map((r, i) => <div className="row" key={i} style={{ gridTemplateColumns: head.map(() => 'minmax(0,1fr)').join(' ') }}>
      {r.map((c, j) => <span key={j} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</span>)}
    </div>)}
  </div>
}

export default function CompanyReportPage() {
  const [symbol, setSymbol] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState<any>(null)

  async function generate(e: React.FormEvent) {
    e.preventDefault()
    if (!symbol.trim()) return
    setLoading(true); setError(''); setReport(null)
    try {
      const r = await fetch(`/api/company-report?symbol=${encodeURIComponent(symbol.trim().toUpperCase())}`)
      const j = await r.json()
      if (!r.ok) { setError(j.error || 'Could not generate report.'); setLoading(false); return }
      setReport(j)
    } catch (e: any) { setError(`Request failed: ${e.message}`) }
    setLoading(false)
  }

  return <div className="shell">
    <section className="hero"><div><div className="eyebrow">EQUITY RESEARCH</div><h1>Company <span>Analysis Report.</span></h1><p className="muted">Enter a publicly traded ticker to generate a comprehensive report built entirely from real, free market data — nothing is invented, and any metric a company doesn't publicly report is labeled as such.</p></div></section>

    <section className="panel">
      <form onSubmit={generate} className="add-holding-grid" style={{ gridTemplateColumns: '2fr 1fr', alignItems: 'end' }}>
        <label>Ticker symbol<input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="e.g. AAPL" required /></label>
        <button className="run" type="submit" disabled={loading} style={{ marginTop: 0 }}>{loading ? 'GENERATING…' : 'GENERATE COMPANY ANALYSIS'}</button>
      </form>
      {error && <p className="msg banner" style={{ marginTop: 16 }}>{error}</p>}
    </section>

    {report && <>
      {/* 1. COMPANY & BUSINESS OVERVIEW */}
      <section className="panel">
        <div className="panel-title"><h2>1. COMPANY &amp; BUSINESS OVERVIEW</h2><span className="muted">Price as of {report.overview.priceAsOf}</span></div>
        <div className="metrics" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          <div><span>Company</span><b>{report.overview.name}</b></div>
          <div><span>Ticker</span><b>{report.overview.ticker} · {report.overview.exchange}</b></div>
          <div><span>Current price</span><b><Val v={report.overview.price} money /></b></div>
          <div><span>Market cap</span><b><Val v={report.overview.marketCap} money /></b></div>
          <div><span>Sector</span><b><Val v={report.overview.sector} /></b></div>
          <div><span>Industry</span><b><Val v={report.overview.industry} /></b></div>
          <div><span>Headquarters</span><b><Val v={report.overview.hq} /></b></div>
          <div><span>CEO</span><b><Val v={report.overview.ceo} /></b></div>
          <div><span>Founded</span><b><Val v={report.overview.founded} /></b></div>
          <div><span>Employees</span><b><Val v={report.overview.employees} /></b></div>
          <div><span>Website</span><b><Val v={report.overview.website} /></b></div>
        </div>
        <div className="section-label"><b>WHAT THE COMPANY DOES</b></div>
        <p className="muted" style={{ lineHeight: 1.6 }}>{report.narrative.businessExplanation}</p>
        <div className="section-label"><b>MAIN PRODUCTS, REVENUE SOURCES, SEGMENTS &amp; GEOGRAPHIC EXPOSURE</b></div>
        <p className="tiny">This tool's free data sources do not provide a structured breakdown of business segments or geographic revenue mix. The explanation above is drawn from the company's own public business description; a structured segment/geography split is <b>Not publicly reported</b> through this tool.</p>
      </section>

      {/* 2. COMPETITIVE COMPARISON */}
      <section className="panel">
        <div className="panel-title"><h2>2. COMPETITIVE COMPARISON</h2></div>
        {report.competitors.length > 1 ? <Table
          head={['Company', 'Price', 'Mkt Cap', 'P/E', 'Rev Growth', 'Gross Mgn', 'Op Mgn', 'Net Mgn', 'FCF', '1Y Return']}
          rows={report.competitors.map((c: any) => [
            `${c.symbol}${c.symbol === report.symbol ? ' (this co.)' : ''}`,
            c.price != null ? `$${c.price.toFixed(2)}` : 'N/A', fmtMoney(c.marketCap), c.peRatio != null ? c.peRatio.toFixed(1) : 'N/A',
            fmtPct(c.revenueGrowth), fmtPct(c.grossMargin), fmtPct(c.operatingMargin), fmtPct(c.netMargin), fmtMoney(c.freeCashFlow), fmtPct(c.oneYearReturn, true),
          ])}
        /> : <p className="muted">No comparable publicly traded competitors could be identified through this tool's free data sources.</p>}
        <div className="section-label"><b>ANALYSIS</b></div>
        <p className="muted" style={{ lineHeight: 1.6 }}>{report.narrative.competitiveAnalysis}</p>
      </section>

      {/* 3. CUSTOMER GROWTH ANALYSIS */}
      <section className="panel">
        <div className="panel-title"><h2>3. CUSTOMER GROWTH ANALYSIS</h2></div>
        <p className="muted">{report.customerGrowth.status}</p>
        <p className="tiny">{report.narrative.customerGrowthAnalysis}</p>
      </section>

      {/* 4. BRAND STRENGTH ANALYSIS */}
      <section className="panel">
        <div className="panel-title"><h2>4. BRAND STRENGTH ANALYSIS</h2></div>
        <div className="section-label"><b>DOCUMENTED FACTS</b></div>
        <ul style={{ margin: '8px 0', paddingLeft: 20, color: 'var(--muted)', fontSize: 13, lineHeight: 1.7 }}>
          {(report.narrative.brandStrengthFacts || []).map((b: string, i: number) => <li key={i}>{b}</li>)}
        </ul>
        <div className="section-label"><b>AI ANALYSIS / INFERENCE</b></div>
        <ul style={{ margin: '8px 0', paddingLeft: 20, color: 'var(--muted)', fontSize: 13, lineHeight: 1.7 }}>
          {(report.narrative.brandStrengthInference || []).map((b: string, i: number) => <li key={i}>{b}</li>)}
        </ul>
      </section>

      {/* 5. SWOT */}
      <section className="panel">
        <div className="panel-title"><h2>5. SWOT ANALYSIS</h2></div>
        <div className="metrics" style={{ gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
          {(['strengths', 'weaknesses', 'opportunities', 'threats'] as const).map(k => <div key={k} style={{ textAlign: 'left' }}>
            <span style={{ textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 11 }}>{k}</span>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--text)', fontSize: 13, lineHeight: 1.7 }}>
              {(report.narrative.swot?.[k] || []).map((b: string, i: number) => <li key={i}>{b}</li>)}
              {!(report.narrative.swot?.[k] || []).length && <li className="muted">Data unavailable</li>}
            </ul>
          </div>)}
        </div>
      </section>

      {/* 6. EXECUTIVE SUMMARY */}
      <section className="panel">
        <div className="panel-title"><h2>6. EXECUTIVE SUMMARY</h2></div>
        <p className="muted" style={{ lineHeight: 1.7 }}>{report.narrative.executiveSummary}</p>
      </section>

      {/* 7. FINANCIAL HEALTH */}
      <section className="panel">
        <div className="panel-title"><h2>7. FINANCIAL HEALTH</h2><span className="muted">As of {report.financialHealth.asOf}</span></div>
        <div className="section-label"><b>INCOME STATEMENT (TTM)</b></div>
        <div className="metrics" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          <div><span>Revenue</span><b><Val v={report.financialHealth.income.revenueTTM} money /></b></div>
          <div><span>Revenue growth</span><b><Val v={report.financialHealth.income.revenueGrowth} pct /></b></div>
          <div><span>Gross profit</span><b><Val v={report.financialHealth.income.grossProfitTTM} money /></b></div>
          <div><span>Gross margin</span><b><Val v={report.financialHealth.income.grossMargin} pct /></b></div>
          <div><span>Operating margin</span><b><Val v={report.financialHealth.income.operatingMargin} pct /></b></div>
          <div><span>Net margin</span><b><Val v={report.financialHealth.income.netMargin} pct /></b></div>
          <div><span>Net income growth</span><b><Val v={report.financialHealth.income.netIncomeGrowth} pct /></b></div>
          <div><span>EPS (trailing / forward)</span><b>{report.financialHealth.income.epsTrailing ?? '—'} / {report.financialHealth.income.epsForward ?? '—'}</b></div>
        </div>
        {Array.isArray(report.financialHealth.income.revenueHistory) && <RevenueChart history={report.financialHealth.income.revenueHistory} />}
        <div className="section-label"><b>BALANCE SHEET (LATEST SNAPSHOT)</b></div>
        <div className="metrics" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          <div><span>Cash &amp; equivalents</span><b><Val v={report.financialHealth.balanceSheet.totalCash} money /></b></div>
          <div><span>Total debt</span><b><Val v={report.financialHealth.balanceSheet.totalDebt} money /></b></div>
          <div><span>Net debt</span><b><Val v={report.financialHealth.balanceSheet.netDebt} money /></b></div>
          <div><span>Current ratio</span><b><Val v={report.financialHealth.balanceSheet.currentRatio} /></b></div>
          <div><span>Debt / equity</span><b>{report.financialHealth.balanceSheet.debtToEquity != null ? `${report.financialHealth.balanceSheet.debtToEquity.toFixed(1)}%` : 'Data unavailable'}</b></div>
          <div><span>Book value / share</span><b><Val v={report.financialHealth.balanceSheet.bookValuePerShare} money /></b></div>
        </div>
        <p className="tiny">{report.financialHealth.balanceSheet.note}</p>
        <div className="section-label"><b>CASH FLOW (TTM)</b></div>
        <div className="metrics" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          <div><span>Operating cash flow</span><b><Val v={report.financialHealth.cashFlow.operatingCashFlow} money /></b></div>
          <div><span>Free cash flow</span><b><Val v={report.financialHealth.cashFlow.freeCashFlow} money /></b></div>
          <div><span>FCF margin</span><b><Val v={report.financialHealth.cashFlow.fcfMargin} pct /></b></div>
        </div>
      </section>

      {/* 8. MANAGEMENT & INSIDER ACTIVITY */}
      <section className="panel">
        <div className="panel-title"><h2>8. MANAGEMENT &amp; INSIDER ACTIVITY</h2></div>
        <div className="metrics" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          <div><span>CEO</span><b>{report.management.ceo === 'Not publicly reported' ? 'Not publicly reported' : `${report.management.ceo.name} · ${fmtMoney(report.management.ceo.totalPay)} total pay`}</b></div>
          <div><span>CFO</span><b>{report.management.cfo === 'Not publicly reported' ? 'Not publicly reported' : `${report.management.cfo.name} · ${fmtMoney(report.management.cfo.totalPay)} total pay`}</b></div>
          <div><span>Shares outstanding</span><b><Val v={report.management.sharesOutstanding} /></b></div>
          <div><span>Insider ownership</span><b><Val v={report.management.insiderOwnershipPct} pct alreadyPct /></b></div>
          <div><span>Institutional ownership</span><b><Val v={report.management.institutionalOwnershipPct} pct alreadyPct /></b></div>
          <div><span>Institutions holding</span><b><Val v={report.management.institutionsCount} /></b></div>
        </div>
        <div className="section-label"><b>OTHER NAMED EXECUTIVES</b></div>
        {report.management.officers.length ? <Table head={['Name', 'Title', 'Total pay']} rows={report.management.officers.map((o: any) => [o.name, o.title, fmtMoney(o.totalPay)])} /> : <p className="muted">Not publicly reported</p>}
        <div className="section-label"><b>RECENT INSIDER TRANSACTIONS</b></div>
        {report.management.recentInsiderTransactions.length ? <Table head={['Filer', 'Relation', 'Transaction', 'Shares', 'Value', 'Date']} rows={report.management.recentInsiderTransactions.map((t: any) => [t.filer, t.relation || '—', t.text || '—', fmtNum(t.shares), fmtMoney(t.value), t.date || '—'])} /> : <p className="muted">Not publicly reported</p>}
        <p className="tiny">Total pay figures are as reported to the SEC and include salary, bonus, and equity awards. Management tenure, historical guidance-vs-actual detail beyond quarterly EPS surprises, and share dilution history are Data unavailable through this tool's free sources.</p>
      </section>

      {/* 9. RECENT NEWS & EVENTS */}
      <section className="panel">
        <div className="panel-title"><h2>9. RECENT NEWS &amp; EVENTS</h2></div>
        {report.news.length ? report.news.map((n: any, i: number) => {
          const commentary = (report.narrative.newsCommentary || []).find((c: any) => c.title === n.title)
          return <div className="test-item" key={i} style={{ display: 'block', marginBottom: 8 }}>
            <div className="test-item-main"><b><a href={n.link} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{n.title}</a></b><span>{n.pubDate}</span></div>
            {commentary && <p className="tiny" style={{ marginTop: 6 }}><b>Why it matters:</b> {commentary.whyItMatters}</p>}
          </div>
        }) : <p className="muted">No recent news found.</p>}
        {report.analystRevisions.length > 0 && <>
          <div className="section-label"><b>ANALYST ESTIMATE REVISIONS</b></div>
          <Table head={['Firm', 'Action', 'From → To', 'Price target', 'Date']} rows={report.analystRevisions.map((a: any) => [a.firm, a.action, `${a.fromGrade} → ${a.toGrade}`, a.priceTarget != null ? `$${a.priceTarget}` : '—', a.date || '—'])} />
        </>}
        {report.earningsSurprises.length > 0 && <>
          <div className="section-label"><b>RECENT EARNINGS SURPRISES</b></div>
          <Table head={['Quarter', 'Actual EPS', 'Estimate', 'Surprise', 'Reported']} rows={report.earningsSurprises.map((q: any) => [q.quarter, q.actual ?? '—', q.estimate ?? '—', q.surprisePct != null ? `${q.surprisePct}%` : '—', q.reportedDate || '—'])} />
        </>}
      </section>

      {/* 10. UPCOMING CATALYSTS */}
      <section className="panel">
        <div className="panel-title"><h2>10. UPCOMING CATALYSTS</h2></div>
        <div className="metrics" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          <div><span>Next earnings date</span><b><Val v={report.catalysts.nextEarningsDate} />{report.catalysts.isEstimate ? ' (estimate)' : ''}</b></div>
          <div><span>Earnings call</span><b><Val v={report.catalysts.earningsCallDate} /></b></div>
          <div><span>Ex-dividend date</span><b><Val v={report.catalysts.exDividendDate} /></b></div>
          <div><span>EPS estimate (avg)</span><b>{report.catalysts.epsEstimateAvg ?? 'Data unavailable'}{report.catalysts.epsEstimateLow != null ? ` (range ${report.catalysts.epsEstimateLow}–${report.catalysts.epsEstimateHigh})` : ''}</b></div>
          <div><span>Revenue estimate (avg)</span><b><Val v={report.catalysts.revenueEstimateAvg} money /></b></div>
          <div><span>Analyst price target (mean)</span><b>{report.catalysts.analystTargetMean != null ? `$${report.catalysts.analystTargetMean} (${report.catalysts.numberOfAnalysts} analysts)` : 'Data unavailable'}</b></div>
        </div>
        <p className="muted" style={{ lineHeight: 1.6 }}>{report.narrative.catalystCommentary}</p>
        <p className="tiny">No outcome is predicted for any upcoming event — figures above are analyst consensus estimates, not forecasts by this tool.</p>
      </section>

      {/* 11. TECHNICAL ANALYSIS */}
      <section className="panel">
        <div className="panel-title"><h2>11. TECHNICAL ANALYSIS</h2></div>
        <div className="metrics" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          <div><span>Price</span><b><Val v={report.technicals.price} money /></b></div>
          <div><span>52-week high / low</span><b>{fmtMoney(report.technicals.week52High)} / {fmtMoney(report.technicals.week52Low)}</b></div>
          <div><span>20 / 50-day MA</span><b>{fmtMoney(report.technicals.sma20)} / {fmtMoney(report.technicals.sma50)}</b></div>
          <div><span>100 / 200-day MA</span><b>{fmtMoney(report.technicals.sma100)} / {fmtMoney(report.technicals.sma200)}</b></div>
          <div><span>RSI (14)</span><b><Val v={report.technicals.rsi14} /></b></div>
          <div><span>MACD</span><b>{report.technicals.macd ? `${report.technicals.macd.macd.toFixed(2)} (signal ${report.technicals.macd.signal.toFixed(2)})` : 'Data unavailable'}</b></div>
          <div><span>ATR (14)</span><b><Val v={report.technicals.atr14} money /></b></div>
          <div><span>Volume / Avg (3M)</span><b>{fmtNum(report.technicals.volume)} / {fmtNum(report.technicals.avgVolume3M)}</b></div>
          <div><span>Relative volume</span><b>{report.technicals.relativeVolume != null ? `${report.technicals.relativeVolume.toFixed(2)}×` : 'Data unavailable'}</b></div>
          <div><span>Support / Resistance</span><b>{fmtMoney(report.technicals.support)} / {fmtMoney(report.technicals.resistance)}</b></div>
          <div><span>Trend</span><b>{report.technicals.trend}</b></div>
        </div>
        <div className="section-label"><b>PERFORMANCE VS S&amp;P 500 (SPY)</b></div>
        <Table head={['Period', 'This stock', 'S&P 500 (SPY)']} rows={[
          ['1 month', fmtPct(report.technicals.perfVsSpy.oneMonth.stock, true), fmtPct(report.technicals.perfVsSpy.oneMonth.spy, true)],
          ['3 months', fmtPct(report.technicals.perfVsSpy.threeMonth.stock, true), fmtPct(report.technicals.perfVsSpy.threeMonth.spy, true)],
          ['1 year', fmtPct(report.technicals.perfVsSpy.oneYear.stock, true), fmtPct(report.technicals.perfVsSpy.oneYear.spy, true)],
          ['3 years', fmtPct(report.technicals.perfVsSpy.threeYear.stock, true), fmtPct(report.technicals.perfVsSpy.threeYear.spy, true)],
          ['5 years', fmtPct(report.technicals.perfVsSpy.fiveYear.stock, true), fmtPct(report.technicals.perfVsSpy.fiveYear.spy, true)],
        ]} />
        <p className="muted" style={{ lineHeight: 1.6 }}>{report.narrative.technicalsCommentary}</p>
      </section>

      {/* 12. SHAREHOLDER RETURNS */}
      <section className="panel">
        <div className="panel-title"><h2>12. SHAREHOLDER RETURNS</h2></div>
        <div className="metrics" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          <div><span>Dividend yield</span><b><Val v={report.shareholderReturns.dividendYieldPct} pct alreadyPct /></b></div>
          <div><span>Dividend rate</span><b><Val v={report.shareholderReturns.dividendRate} money /></b></div>
          <div><span>Payout ratio</span><b><Val v={report.shareholderReturns.payoutRatioPct} pct alreadyPct /></b></div>
          <div><span>5yr avg dividend yield</span><b>{report.shareholderReturns.fiveYearAvgDividendYieldPct != null ? `${report.shareholderReturns.fiveYearAvgDividendYieldPct}%` : 'Data unavailable'}</b></div>
        </div>
        <p className="tiny">{report.shareholderReturns.buybacksNote}</p>
        <div className="section-label"><b>PRICE PERFORMANCE VS S&amp;P 500</b></div>
        <Table head={['Period', 'This stock', 'S&P 500 (SPY)']} rows={[
          ['1 year', fmtPct(report.shareholderReturns.priceReturnVsSpy.oneYear.stock, true), fmtPct(report.shareholderReturns.priceReturnVsSpy.oneYear.spy, true)],
          ['3 years', fmtPct(report.shareholderReturns.priceReturnVsSpy.threeYear.stock, true), fmtPct(report.shareholderReturns.priceReturnVsSpy.threeYear.spy, true)],
          ['5 years', fmtPct(report.shareholderReturns.priceReturnVsSpy.fiveYear.stock, true), fmtPct(report.shareholderReturns.priceReturnVsSpy.fiveYear.spy, true)],
        ]} />
      </section>

      {/* 13. ANALYSIS */}
      <section className="panel">
        <div className="panel-title"><h2>13. ANALYSIS</h2></div>
        <p className="muted" style={{ lineHeight: 1.7 }}>{report.narrative.finalAnalysis}</p>
        {report.narrative.mode === 'template' && <p className="tiny" style={{ marginTop: 12 }}>Written synthesis sections use a plain template because no ANTHROPIC_API_KEY is configured for this deployment — every number shown throughout this report is still real and independently sourced/computed.</p>}
      </section>
    </>}
  </div>
}
