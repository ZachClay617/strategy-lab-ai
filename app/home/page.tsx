'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type Profile = { full_name:string|null; gender:string|null }
type Portfolio = { id:string; name:string }
type Holding = { portfolio_id:string; symbol:string; entry_price?:number|null; shares?:number|null }
type ClosedTrade = { portfolio_id:string; symbol:string; shares:number; entry_price:number; realized_pl:number }
type PriceInfo = { last:number; prevClose:number|null }

function fmtPct(n:number|null){if(n==null)return '—';return `${n>=0?'+':''}${n.toFixed(2)}%`}
function fmtExact(n:number){const sign=n<0?'-':'';return `${sign}$${Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`}
function fmtDollar(n:number){return `${n>=0?'+':'-'}${fmtExact(Math.abs(n))}`}

function greeting(profile:Profile|null,fallbackEmail?:string|null){
  const hour=new Date().getHours()
  const timeOfDay=hour<12?'morning':hour<18?'afternoon':'evening'
  const fullName=profile?.full_name?.trim()
  const lastName=fullName?fullName.split(/\s+/).pop():null
  const title=profile?.gender==='male'?'Mr. ':profile?.gender==='female'?'Ms. ':''
  const who=lastName?`${title}${lastName}`:(fallbackEmail?fallbackEmail.split('@')[0]:'there')
  return `Good ${timeOfDay}, ${who}.`
}

export default function HomePage(){
  const [session,setSession]=useState<any>(null)
  const [profile,setProfile]=useState<Profile|null>(null)
  const [portfolios,setPortfolios]=useState<Portfolio[]>([])
  const [holdings,setHoldings]=useState<Holding[]>([])
  const [closedTrades,setClosedTrades]=useState<ClosedTrade[]>([])
  const [prices,setPrices]=useState<Record<string,PriceInfo>>({})
  const [loading,setLoading]=useState(true)
  const [msg,setMsg]=useState('')
  const [testsLast7Days,setTestsLast7Days]=useState(0)
  const [testStockCount,setTestStockCount]=useState(0)
  const [signalStockCount,setSignalStockCount]=useState(0)
  const [notificationCount,setNotificationCount]=useState(0)
  const [trackedStockCount,setTrackedStockCount]=useState(0)

  useEffect(()=>{if(!supabase)return;supabase.auth.getSession().then(({data})=>setSession(data.session));const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>data.subscription.unsubscribe()},[])
  useEffect(()=>{if(session?.user)loadAll();else setLoading(false)},[session?.user?.id])

  async function loadAll(){
    if(!supabase||!session?.user)return
    setLoading(true)
    const [{data:p},{data:ports,error:portsErr}]=await Promise.all([
      supabase.from('profiles').select('full_name,gender').eq('id',session.user.id).maybeSingle(),
      supabase.from('portfolios').select('id,name').eq('user_id',session.user.id),
    ])
    setProfile((p as Profile)||null)
    if(portsErr){setMsg(`Could not load portfolio overview: ${portsErr.message}`);setLoading(false);return}
    const portfolioIds=(ports||[]).map((x:any)=>x.id)
    setPortfolios((ports||[]) as Portfolio[])
    if(!portfolioIds.length){setHoldings([]);setClosedTrades([]);setLoading(false);return}
    const [{data:h,error:hErr},{data:c,error:cErr}]=await Promise.all([
      supabase.from('portfolio_holdings').select('portfolio_id,symbol,entry_price,shares').in('portfolio_id',portfolioIds),
      supabase.from('portfolio_realized_trades').select('portfolio_id,symbol,shares,entry_price,realized_pl').in('portfolio_id',portfolioIds),
    ])
    if(hErr){setMsg(`Could not load holdings: ${hErr.message}`);setLoading(false);return}
    setHoldings((h||[]) as Holding[])
    setClosedTrades((cErr?[]:(c||[])) as ClosedTrade[])
    const symbols=Array.from(new Set((h||[]).map((x:any)=>x.symbol as string)))
    if(symbols.length)await loadPrices(symbols)
    await loadBriefingStats(session.user.id)
    setLoading(false)
  }

  async function loadBriefingStats(userId:string){
    if(!supabase)return
    const sevenDaysAgo=new Date(Date.now()-7*24*60*60*1000).toISOString()
    const [{data:runs},{data:signals},{count:pending},{data:watched}]=await Promise.all([
      supabase.from('research_runs').select('symbol,tested_count,variations_requested').eq('user_id',userId).gte('started_at',sevenDaysAgo),
      supabase.from('trade_notifications').select('symbol').eq('user_id',userId).eq('acknowledged',false),
      supabase.from('trade_notifications').select('id',{count:'exact',head:true}).eq('user_id',userId).eq('acknowledged',false),
      supabase.from('watchlist_symbols').select('symbol').eq('user_id',userId),
    ])
    setTestsLast7Days((runs||[]).reduce((sum:number,r:any)=>sum+(r.tested_count||r.variations_requested||0),0))
    setTestStockCount(new Set((runs||[]).map((r:any)=>r.symbol)).size)
    setSignalStockCount(new Set((signals||[]).map((s:any)=>s.symbol)).size)
    setTrackedStockCount(new Set((watched||[]).map((w:any)=>w.symbol)).size)
    setNotificationCount(pending||0)
  }

  async function loadPrices(symbols:string[]){
    const entries=await Promise.all(symbols.map(async sym=>{
      try{
        const dailyRes=await fetch(`/api/market?symbol=${encodeURIComponent(sym)}&interval=1d&rangeDays=10`)
        const daily=await dailyRes.json()
        const closes=Array.isArray(daily)?daily.map((c:any)=>c.close):[]
        const prevClose=closes.length>1?closes[closes.length-2]:null
        const liveRes=await fetch(`/api/market?symbol=${encodeURIComponent(sym)}&live=1`)
        const live=await liveRes.json()
        const lastLive=Array.isArray(live)&&live.length?live[live.length-1].close:null
        if(lastLive!=null)return [sym,{last:lastLive,prevClose:prevClose??(closes.length?closes[closes.length-1]:null)}] as const
        if(closes.length)return [sym,{last:closes[closes.length-1],prevClose}] as const
        return [sym,null] as const
      }catch{return [sym,null] as const}
    }))
    setPrices(prev=>{const next={...prev};for(const [sym,v] of entries)if(v)next[sym]=v;return next})
  }

  let value=0,costBasis=0,returnDollar=0,priorValue=0,dayReturnDollar=0
  let unrealizedCostBasis=0,unrealizedDollar=0
  for(const h of holdings){
    const p=prices[h.symbol];if(!p)continue
    const sh=h.shares!=null?h.shares:1
    value+=sh*p.last
    if(h.entry_price!=null){
      costBasis+=h.entry_price*sh;returnDollar+=(p.last-h.entry_price)*sh
      unrealizedCostBasis+=h.entry_price*sh;unrealizedDollar+=(p.last-h.entry_price)*sh
    }
    if(p.prevClose){priorValue+=p.prevClose*sh;dayReturnDollar+=(p.last-p.prevClose)*sh}
  }
  let realizedCostBasis=0,realizedDollar=0
  for(const c of closedTrades){
    costBasis+=c.entry_price*c.shares;returnDollar+=c.realized_pl
    realizedCostBasis+=c.entry_price*c.shares;realizedDollar+=c.realized_pl
  }
  const overview={
    value,
    returnPct:costBasis>0?returnDollar/costBasis*100:null,
    returnDollar,
    dayReturnPct:priorValue>0?dayReturnDollar/priorValue*100:null,
    dayReturnDollar,
    unrealizedPct:unrealizedCostBasis>0?unrealizedDollar/unrealizedCostBasis*100:null,
    unrealizedDollar,
    realizedPct:realizedCostBasis>0?realizedDollar/realizedCostBasis*100:null,
    realizedDollar,
  }
  const hasAnyData=holdings.length>0||closedTrades.length>0

  const perPortfolio:Record<string,{costBasis:number;returnDollar:number}>={}
  for(const h of holdings){
    const p=prices[h.symbol];if(!p||h.entry_price==null)continue
    const sh=h.shares!=null?h.shares:1
    const bucket=perPortfolio[h.portfolio_id]||(perPortfolio[h.portfolio_id]={costBasis:0,returnDollar:0})
    bucket.costBasis+=h.entry_price*sh;bucket.returnDollar+=(p.last-h.entry_price)*sh
  }
  for(const c of closedTrades){
    const bucket=perPortfolio[c.portfolio_id]||(perPortfolio[c.portfolio_id]={costBasis:0,returnDollar:0})
    bucket.costBasis+=c.entry_price*c.shares;bucket.returnDollar+=c.realized_pl
  }
  let topPortfolio:{name:string;pct:number;dollar:number}|null=null
  for(const port of portfolios){
    const bucket=perPortfolio[port.id];if(!bucket||bucket.costBasis<=0)continue
    const pct=bucket.returnDollar/bucket.costBasis*100
    if(!topPortfolio||pct>topPortfolio.pct)topPortfolio={name:port.name,pct,dollar:bucket.returnDollar}
  }

  let topHoldingAllTime:{symbol:string;pct:number;dollar:number}|null=null
  let topHoldingToday:{symbol:string;pct:number;dollar:number}|null=null
  for(const h of holdings){
    const p=prices[h.symbol];if(!p)continue
    const sh=h.shares!=null?h.shares:1
    if(h.entry_price!=null&&h.entry_price>0){
      const pct=(p.last-h.entry_price)/h.entry_price*100
      if(!topHoldingAllTime||pct>topHoldingAllTime.pct)topHoldingAllTime={symbol:h.symbol,pct,dollar:(p.last-h.entry_price)*sh}
    }
    if(p.prevClose){
      const pct=(p.last-p.prevClose)/p.prevClose*100
      if(!topHoldingToday||pct>topHoldingToday.pct)topHoldingToday={symbol:h.symbol,pct,dollar:(p.last-p.prevClose)*sh}
    }
  }

  if(!supabase)return <div className="shell"><p className="msg banner">Add Supabase environment variables first.</p></div>
  // proxy.ts already redirects a logged-out visitor to /login before
  // this page's own code ever runs — this is just the brief moment before
  // the client's own session state catches up for an actually-logged-in user.
  if(!session)return null

  const perfDir=overview.returnPct!=null&&overview.returnPct>=0?'up':'down'
  const perfLine=hasAnyData&&overview.returnPct!=null
    ?`Your portfolios are ${perfDir} ${Math.abs(overview.returnPct).toFixed(2)}% — that's ${fmtExact(Math.abs(overview.returnDollar))} ${perfDir} since you opened them.`
    :`You haven't opened a portfolio yet. Tell me what you want and I'll build it.`
  const dayDir=overview.dayReturnPct!=null&&overview.dayReturnPct>=0?'up':'down'
  const dayLine=hasAnyData&&overview.dayReturnPct!=null
    ?`Today, your portfolios are ${dayDir} ${Math.abs(overview.dayReturnPct).toFixed(2)}% (${fmtExact(Math.abs(overview.dayReturnDollar))}).`
    :null
  const topHoldingLine=topHoldingToday
    ?`Your best mover today is ${topHoldingToday.symbol}, ${topHoldingToday.pct>=0?'up':'down'} ${Math.abs(topHoldingToday.pct).toFixed(2)}% (${fmtDollar(topHoldingToday.dollar)}).`
    :null
  const testsLine=`I've run ${testsLast7Days.toLocaleString()} strategy test${testsLast7Days===1?'':'s'} for you in the last 7 days across ${testStockCount.toLocaleString()} stock${testStockCount===1?'':'s'}.`
  const signalsLine=`I've found and fired trade signals on ${signalStockCount.toLocaleString()} stock${signalStockCount===1?'':'s'} you haven't confirmed yet.`
  const trackedLine=trackedStockCount>0
    ?`My eyes are on ${trackedStockCount.toLocaleString()} stock${trackedStockCount===1?'':'s'} right now, watching every tick for a signal worth your attention.`
    :`I'm not watching any stocks for signals yet — add tickers to your watchlist and I'll start scanning them around the clock.`
  const notifLine=`You have ${notificationCount.toLocaleString()} notification${notificationCount===1?'':'s'} waiting for your review.`

  return <div className="shell home-page">
    <section className="hero home-hero">
      <div>
        <div className="online-badge"><span className="online-dot"></span>A-TAMP ONLINE</div>
        <h1 className="home-greeting">{greeting(profile,session.user.email)}</h1>
        <p className="muted home-tagline">A-TAMP is online and ready to be at your service.</p>
      </div>
    </section>

    <section className="ai-briefing">
      <div className="ai-briefing-scanline"></div>
      <div className="ai-briefing-head">
        <span className="ai-briefing-avatar"><span className="ai-briefing-avatar-core"></span></span>
        <div>
          <div className="ai-briefing-label">A-TAMP BRIEFING</div>
          <div className="ai-briefing-sub">{loading?'Compiling your briefing…':'Live · compiled just now'}</div>
        </div>
      </div>
      {!loading&&<div className="ai-briefing-body">
        <p><span className={`ai-briefing-caret ${perfDir}`}>▸</span>{perfLine}</p>
        {dayLine&&<p><span className={`ai-briefing-caret ${dayDir}`}>▸</span>{dayLine}</p>}
        {topHoldingLine&&<p><span className={`ai-briefing-caret ${topHoldingToday!.pct>=0?'up':'down'}`}>▸</span>{topHoldingLine}</p>}
        <p><span className="ai-briefing-caret">▸</span>{testsLine}</p>
        <p><span className="ai-briefing-caret">▸</span>{signalsLine}</p>
        <p><span className="ai-briefing-caret">▸</span>{trackedLine}</p>
        <p><span className="ai-briefing-caret">▸</span>{notifLine}<span className="ai-briefing-cursor"></span></p>
      </div>}
    </section>

    {msg&&<p className="msg banner">{msg}</p>}

    <div className="service-grid">
      <Link href="/research" className="service-card">
        <span className="service-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="ic-research" x1="0" y1="0" x2="24" y2="24"><stop offset="0" stopColor="#8ff3ff"/><stop offset="1" stopColor="#8b72ff"/></linearGradient></defs>
            <circle cx="11" cy="11" r="7" stroke="url(#ic-research)" strokeWidth="1.6"/>
            <circle cx="11" cy="11" r="3.4" stroke="url(#ic-research)" strokeWidth="1.2" opacity=".7"/>
            <circle cx="11" cy="11" r="1.1" fill="url(#ic-research)"/>
            <path d="M16.2 16.2L21 21" stroke="url(#ic-research)" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M11 4.4V2.6M17.6 11h1.8M11 17.6v1.8M4.4 11H2.6" stroke="url(#ic-research)" strokeWidth="1.1" strokeLinecap="round" opacity=".55"/>
          </svg>
        </span>
        <h2>Research</h2>
        <p>Generate and backtest strategies against real historical and live market data.</p>
        <span className="service-cta">ENTER RESEARCH →</span>
      </Link>
      <Link href="/portfolios" className="service-card">
        <span className="service-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="ic-portfolios" x1="0" y1="0" x2="24" y2="24"><stop offset="0" stopColor="#8ff3ff"/><stop offset="1" stopColor="#8b72ff"/></linearGradient></defs>
            <rect x="3.2" y="13.2" width="4.2" height="7.4" rx="1" fill="url(#ic-portfolios)" opacity=".85"/>
            <rect x="9.9" y="8.4" width="4.2" height="12.2" rx="1" fill="url(#ic-portfolios)"/>
            <rect x="16.6" y="4.4" width="4.2" height="16.2" rx="1" fill="url(#ic-portfolios)" opacity=".85"/>
            <path d="M3 9.6L9 5l4.5 3 7.5-5.6" stroke="url(#ic-portfolios)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M17 2.4h4v4" stroke="url(#ic-portfolios)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
        <h2>Portfolios</h2>
        <p>Speak your intent to A-TAMP in plain language and watch it materialize a live portfolio — real holdings, real returns, tracked in real time.</p>
        <span className="service-cta">ENTER PORTFOLIOS →</span>
      </Link>
      <Link href="/company-report" className="service-card">
        <span className="service-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="ic-reports" x1="0" y1="0" x2="24" y2="24"><stop offset="0" stopColor="#8ff3ff"/><stop offset="1" stopColor="#8b72ff"/></linearGradient></defs>
            <path d="M6 2.6h8.4L19 7.2V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.6a1 1 0 0 1 1-1Z" stroke="url(#ic-reports)" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M14.2 2.6V6.4a1 1 0 0 0 1 1H19" stroke="url(#ic-reports)" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M7.6 17.4v-3.2M11 17.4v-5.6M14.4 17.4v-2.3M17.8 17.4V9.8" stroke="url(#ic-reports)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </span>
        <h2>Reports</h2>
        <p>Generate a full equity research report on any publicly traded company.</p>
        <span className="service-cta">ENTER REPORTS →</span>
      </Link>
      <Link href="/trade-signals" className="service-card">
        <span className="service-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="ic-signals" x1="0" y1="0" x2="24" y2="24"><stop offset="0" stopColor="#8ff3ff"/><stop offset="1" stopColor="#8b72ff"/></linearGradient></defs>
            <path d="M2 13h3.6l1.8-5.4 3 10.8 2.4-8.4 1.6 3h6.6" stroke="url(#ic-signals)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <circle className="icon-pulse-dot" cx="19.6" cy="13" r="1.8" fill="url(#ic-signals)"/>
          </svg>
        </span>
        <h2>Trade Signals</h2>
        <p>Watch your favorited strategies against live prices and get told exactly when to buy or sell.</p>
        <span className="service-cta">ENTER TRADE SIGNALS →</span>
      </Link>
    </div>

    <section className="panel">
      <div className="panel-title"><h2>ALL PORTFOLIOS OVERVIEW</h2><span className="muted">Across all portfolios</span></div>
      {loading?<div className="empty">Loading your portfolio overview…</div>:!hasAnyData?<div className="empty">No portfolio holdings yet. <Link href="/portfolios">Create a portfolio</Link> to see your overview here.</div>:
      <div className="metrics" style={{gridTemplateColumns:'repeat(5,1fr)'}}>
        <div><span>DAY'S RETURN</span><b className={overview.dayReturnPct==null?'':overview.dayReturnPct>=0?'up':'down'}>{overview.dayReturnPct==null?'—':`${fmtPct(overview.dayReturnPct)} (${fmtDollar(overview.dayReturnDollar)})`}</b></div>
        <div><span>TOTAL VALUE</span><b>{fmtExact(overview.value)}</b></div>
        <div><span>REALIZED RETURN</span><b className={overview.realizedPct==null?'':overview.realizedPct>=0?'up':'down'}>{overview.realizedPct==null?'—':`${fmtPct(overview.realizedPct)} (${fmtDollar(overview.realizedDollar)})`}</b></div>
        <div><span>UNREALIZED RETURN</span><b className={overview.unrealizedPct==null?'':overview.unrealizedPct>=0?'up':'down'}>{overview.unrealizedPct==null?'—':`${fmtPct(overview.unrealizedPct)} (${fmtDollar(overview.unrealizedDollar)})`}</b></div>
        <div><span>TOTAL RETURN</span><b className={overview.returnPct==null?'':overview.returnPct>=0?'up':'down'}>{overview.returnPct==null?'—':`${fmtPct(overview.returnPct)} (${fmtDollar(overview.returnDollar)})`}</b></div>
      </div>}
      {!loading&&hasAnyData&&<div className="metrics" style={{gridTemplateColumns:'repeat(3,1fr)',marginTop:14}}>
        <div><span>TOP-PERFORMING PORTFOLIO</span><b className={!topPortfolio?'':topPortfolio.pct>=0?'up':'down'}>{topPortfolio?`${topPortfolio.name} (${fmtPct(topPortfolio.pct)}, ${fmtDollar(topPortfolio.dollar)})`:'—'}</b></div>
        <div><span>TOP HOLDING · ALL TIME</span><b className={!topHoldingAllTime?'':topHoldingAllTime.pct>=0?'up':'down'}>{topHoldingAllTime?`${topHoldingAllTime.symbol} (${fmtPct(topHoldingAllTime.pct)}, ${fmtDollar(topHoldingAllTime.dollar)})`:'—'}</b></div>
        <div><span>TOP HOLDING · TODAY</span><b className={!topHoldingToday?'':topHoldingToday.pct>=0?'up':'down'}>{topHoldingToday?`${topHoldingToday.symbol} (${fmtPct(topHoldingToday.pct)}, ${fmtDollar(topHoldingToday.dollar)})`:'—'}</b></div>
      </div>}
    </section>
  </div>
}
