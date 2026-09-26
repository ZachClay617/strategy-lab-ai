'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type Profile = { full_name:string|null; gender:string|null }
type Portfolio = { id:string }
type Holding = { portfolio_id:string; symbol:string; entry_price?:number|null; shares?:number|null }
type ClosedTrade = { portfolio_id:string; symbol:string; shares:number; entry_price:number; realized_pl:number }
type PriceInfo = { last:number; prevClose:number|null }

function fmtPct(n:number|null){if(n==null)return '—';return `${n>=0?'+':''}${n.toFixed(2)}%`}
function fmtMoney(n:number){const abs=Math.abs(n);const sign=n<0?'-':''
  if(abs>=1e12)return `${sign}$${(abs/1e12).toFixed(2)}T`
  if(abs>=1e9)return `${sign}$${(abs/1e9).toFixed(2)}B`
  if(abs>=1e6)return `${sign}$${(abs/1e6).toFixed(2)}M`
  if(abs>=1e3)return `${sign}$${(abs/1e3).toFixed(1)}K`
  return `${sign}$${abs.toFixed(2)}`
}
function fmtDollar(n:number){return `${n>=0?'+':'-'}${fmtMoney(Math.abs(n)).replace('$','$')}`}
function fmtExact(n:number){const sign=n<0?'-':'';return `${sign}$${Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`}

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

  useEffect(()=>{if(!supabase)return;supabase.auth.getSession().then(({data})=>setSession(data.session));const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>data.subscription.unsubscribe()},[])
  useEffect(()=>{if(session?.user)loadAll();else setLoading(false)},[session?.user?.id])

  async function loadAll(){
    if(!supabase||!session?.user)return
    setLoading(true)
    const [{data:p},{data:ports,error:portsErr}]=await Promise.all([
      supabase.from('profiles').select('full_name,gender').eq('id',session.user.id).maybeSingle(),
      supabase.from('portfolios').select('id').eq('user_id',session.user.id),
    ])
    setProfile((p as Profile)||null)
    if(portsErr){setMsg(`Could not load portfolio overview: ${portsErr.message}`);setLoading(false);return}
    const portfolioIds=(ports||[]).map((x:any)=>x.id)
    setPortfolios(portfolioIds.map((id:string)=>({id})))
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
    setLoading(false)
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

  if(!supabase)return <div className="shell"><p className="msg banner">Add Supabase environment variables first.</p></div>
  if(!session)return <div className="shell"><p className="msg banner">Log in on the <a href="/research">Research</a> page first, then come back here.</p></div>

  return <div className="shell home-page">
    <section className="hero home-hero">
      <div>
        <div className="online-badge"><span className="online-dot"></span>A-TAMP ONLINE</div>
        <h1 className="home-greeting">{greeting(profile,session.user.email)}</h1>
        <p className="muted home-tagline">A-TAMP is online and ready to be at your service.</p>
      </div>
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
    </div>

    <section className="panel">
      <div className="panel-title"><h2>PORTFOLIO OVERVIEW</h2><span className="muted">Across all portfolios</span></div>
      {loading?<div className="empty">Loading your portfolio overview…</div>:!hasAnyData?<div className="empty">No portfolio holdings yet. <Link href="/portfolios">Create a portfolio</Link> to see your overview here.</div>:
      <div className="metrics" style={{gridTemplateColumns:'repeat(5,1fr)'}}>
        <div><span>DAY'S RETURN</span><b className={overview.dayReturnPct==null?'':overview.dayReturnPct>=0?'up':'down'}>{overview.dayReturnPct==null?'—':`${fmtPct(overview.dayReturnPct)} (${fmtDollar(overview.dayReturnDollar)})`}</b></div>
        <div><span>TOTAL VALUE</span><b>{fmtExact(overview.value)}</b></div>
        <div><span>REALIZED RETURN</span><b className={overview.realizedPct==null?'':overview.realizedPct>=0?'up':'down'}>{overview.realizedPct==null?'—':`${fmtPct(overview.realizedPct)} (${fmtDollar(overview.realizedDollar)})`}</b></div>
        <div><span>UNREALIZED RETURN</span><b className={overview.unrealizedPct==null?'':overview.unrealizedPct>=0?'up':'down'}>{overview.unrealizedPct==null?'—':`${fmtPct(overview.unrealizedPct)} (${fmtDollar(overview.unrealizedDollar)})`}</b></div>
        <div><span>TOTAL RETURN</span><b className={overview.returnPct==null?'':overview.returnPct>=0?'up':'down'}>{overview.returnPct==null?'—':`${fmtPct(overview.returnPct)} (${fmtDollar(overview.returnDollar)})`}</b></div>
      </div>}
    </section>
  </div>
}
