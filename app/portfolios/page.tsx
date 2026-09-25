'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Portfolio = { id:string; name:string; description:string; created_at:string; updated_at:string }
type Holding = { id:string; portfolio_id:string; symbol:string; weight:number; added_by:string; added_at:string; entry_price?:number|null; shares?:number|null }
type LogEntry = { id:string; created_at:string; actor:string; action:string; message:string; detail:any }

function fmtDateTime(iso?:string){if(!iso)return '—';return new Date(iso).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}
function fmtPct(n:number){return `${n>=0?'+':''}${n.toFixed(2)}%`}

export default function Portfolios(){
  const [session,setSession]=useState<any>(null)
  const [portfolios,setPortfolios]=useState<Portfolio[]>([])
  const [selectedId,setSelectedId]=useState<string|null>(null)
  const [holdings,setHoldings]=useState<Holding[]>([])
  const [log,setLog]=useState<LogEntry[]>([])
  const [prices,setPrices]=useState<Record<string,{last:number;prevClose:number|null}>>({})
  const [newName,setNewName]=useState('')
  const [newDesc,setNewDesc]=useState('')
  const [descDraft,setDescDraft]=useState('')
  const [addSymbol,setAddSymbol]=useState('')
  const [addShares,setAddShares]=useState('')
  const [addAvgCost,setAddAvgCost]=useState('')
  const [researching,setResearching]=useState(false)
  const [msg,setMsg]=useState('')
  const [proposal,setProposal]=useState<any>(null)

  useEffect(()=>{if(!supabase)return;supabase.auth.getSession().then(({data})=>setSession(data.session));const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>data.subscription.unsubscribe()},[])
  useEffect(()=>{if(session?.user)loadPortfolios()},[session?.user?.id])
  useEffect(()=>{if(selectedId)loadPortfolio(selectedId);else{setHoldings([]);setLog([]);setDescDraft('')}},[selectedId])
  useEffect(()=>{if(holdings.length)loadPrices(holdings.map(h=>h.symbol))},[holdings.map(h=>h.symbol).join(',')])

  async function loadPortfolios(){
    if(!supabase||!session?.user)return
    const {data,error}=await supabase.from('portfolios').select('*').eq('user_id',session.user.id).order('created_at',{ascending:false})
    if(error){setMsg(`Could not load portfolios: ${error.message}. Run migration_v9_portfolios.sql in Supabase.`);return}
    setPortfolios((data||[]) as Portfolio[])
    if(!selectedId&&data?.length)setSelectedId(data[0].id)
  }
  async function loadPortfolio(id:string){
    if(!supabase)return
    const [{data:h,error:hErr},{data:l,error:lErr}]=await Promise.all([
      supabase.from('portfolio_holdings').select('*').eq('portfolio_id',id).order('weight',{ascending:false}),
      supabase.from('portfolio_log').select('*').eq('portfolio_id',id).order('created_at',{ascending:false}).limit(200),
    ])
    if(hErr||lErr){setMsg(`Could not load portfolio detail: ${hErr?.message||lErr?.message}`);return}
    setHoldings((h||[]) as Holding[]);setLog((l||[]) as LogEntry[])
    const p=portfolios.find(x=>x.id===id);setDescDraft(p?.description||'')
  }
  async function loadPrices(symbols:string[]){
    const entries=await Promise.all(symbols.map(async sym=>{
      const daily=await fetchDailyCloses(sym)
      const prevClose=daily.length>1?daily[daily.length-2]:null
      const live=await fetchLastPrice(sym,true)
      if(live!=null)return [sym,{last:live,prevClose:prevClose??(daily.length?daily[daily.length-1]:null)}] as const
      if(daily.length)return [sym,{last:daily[daily.length-1],prevClose}] as const
      return [sym,null] as const
    }))
    setPrices(prev=>{const next={...prev};for(const [sym,v] of entries)if(v)next[sym]=v;return next})
  }
  async function addLog(portfolioId:string,actor:string,action:string,message:string,detail?:any){
    if(!supabase||!session?.user)return
    await supabase.from('portfolio_log').insert({portfolio_id:portfolioId,user_id:session.user.id,actor,action,message,detail:detail||null})
  }
  async function createPortfolio(e:React.FormEvent){
    e.preventDefault();if(!supabase||!session?.user||!newName.trim())return
    const {data,error}=await supabase.from('portfolios').insert({user_id:session.user.id,name:newName.trim(),description:newDesc.trim()}).select().single()
    if(error){setMsg(`Could not create portfolio: ${error.message}`);return}
    await addLog(data.id,'user','created',`Portfolio "${newName.trim()}" created.${newDesc.trim()?` Description: ${newDesc.trim()}`:''}`)
    setNewName('');setNewDesc('');await loadPortfolios();setSelectedId(data.id)
  }
  async function saveDescription(){
    if(!supabase||!selectedId)return
    const prev=portfolios.find(p=>p.id===selectedId)?.description||''
    const {error}=await supabase.from('portfolios').update({description:descDraft,updated_at:new Date().toISOString()}).eq('id',selectedId)
    if(error){setMsg(`Could not save description: ${error.message}`);return}
    await addLog(selectedId,'user','description_updated',`Description changed.`,{before:prev,after:descDraft})
    await loadPortfolios();await loadPortfolio(selectedId)
  }
  async function fetchLastPrice(symbol:string,live:boolean=true):Promise<number|null>{
    try{
      const url=live?`/api/market?symbol=${encodeURIComponent(symbol)}&live=1`:`/api/market?symbol=${encodeURIComponent(symbol)}&interval=1d&rangeDays=10`
      const r=await fetch(url)
      const j=await r.json()
      return Array.isArray(j)&&j.length?j[j.length-1].close:null
    }catch{return null}
  }
  async function fetchDailyCloses(symbol:string):Promise<number[]>{
    try{
      const url=`/api/market?symbol=${encodeURIComponent(symbol)}&interval=1d&rangeDays=10`
      const r=await fetch(url)
      const j=await r.json()
      return Array.isArray(j)?j.map((c:any)=>c.close):[]
    }catch{return []}
  }
  async function addHolding(e:React.FormEvent){
    e.preventDefault();if(!supabase||!selectedId||!addSymbol.trim())return
    const sym=addSymbol.trim().toUpperCase()
    const sharesNum=Number(addShares)
    if(!sharesNum||sharesNum<=0){setMsg('Enter the number of shares owned.');return}
    const manualCost=addAvgCost.trim()?Number(addAvgCost):null
    const entryPrice=manualCost&&manualCost>0?manualCost:await fetchLastPrice(sym)
    const {error}=await supabase.from('portfolio_holdings').insert({portfolio_id:selectedId,symbol:sym,weight:0,shares:sharesNum,added_by:'user',entry_price:entryPrice})
    if(error){setMsg(`Could not add ${sym}: ${error.message}`);return}
    await addLog(selectedId,'user','holding_added',`Added ${sym} · ${sharesNum} shares${manualCost?`, average cost $${manualCost.toFixed(2)}`:''}.`,{symbol:sym,shares:sharesNum,entryPrice})
    setAddSymbol('');setAddShares('');setAddAvgCost('');await loadPortfolio(selectedId)
  }
  async function removeHolding(h:Holding){
    if(!supabase||!selectedId)return
    const {error}=await supabase.from('portfolio_holdings').delete().eq('id',h.id)
    if(error){setMsg(`Could not remove ${h.symbol}: ${error.message}`);return}
    await addLog(selectedId,'user','holding_removed',`Removed ${h.symbol} (was ${h.shares!=null?`${h.shares} shares`:`${h.weight}% weight`}).`,{symbol:h.symbol,weight:h.weight,shares:h.shares})
    await loadPortfolio(selectedId)
  }
  async function runResearch(){
    if(!selectedId)return
    const portfolio=portfolios.find(p=>p.id===selectedId)
    if(!portfolio?.description.trim()){setMsg('Add a description first so the AI knows what this portfolio should do.');return}
    setResearching(true);setMsg('');setProposal(null)
    try{
      const r=await fetch('/api/portfolio-research',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({description:portfolio.description,holdings:holdings.map(h=>({symbol:h.symbol,weight:weightOf(h)}))})})
      const j=await r.json()
      if(!r.ok){setMsg(j.error||'Research failed.');setResearching(false);return}
      setProposal(j)
    }catch(e:any){setMsg(`Research failed: ${e.message}`)}
    setResearching(false)
  }
  async function applyProposal(){
    if(!supabase||!selectedId||!proposal)return
    const before=holdings.map(h=>({symbol:h.symbol,weight:h.weight}))
    await supabase.from('portfolio_holdings').delete().eq('portfolio_id',selectedId)
    for(const h of proposal.holdings)await supabase.from('portfolio_holdings').insert({portfolio_id:selectedId,symbol:h.symbol,weight:h.weight,added_by:'ai',entry_price:h.entryPrice??null})
    await addLog(selectedId,'ai','ai_rebalance',proposal.summary||'AI rebalanced the portfolio.',{before,after:proposal.holdings,mode:proposal.mode,rationale:proposal.holdings.map((h:any)=>`${h.symbol}: ${h.rationale}`)})
    await supabase.from('portfolios').update({updated_at:new Date().toISOString()}).eq('id',selectedId)
    setProposal(null);await loadPortfolio(selectedId)
  }

  if(!supabase)return <div className="shell"><p className="msg banner">Add Supabase environment variables first.</p></div>
  if(!session)return <div className="shell"><p className="msg banner">Log in on the <a href="/">Research</a> page first, then come back here.</p></div>

  const selected=portfolios.find(p=>p.id===selectedId)
  const holdingValue=(h:Holding)=>{const p=prices[h.symbol];return h.shares!=null&&p?h.shares*p.last:null}
  const sharesValueTotal=holdings.reduce((s,h)=>{const v=holdingValue(h);return v!=null?s+v:s},0)
  const weightOf=(h:Holding)=>{const v=holdingValue(h);return v!=null&&sharesValueTotal>0?v/sharesValueTotal*100:h.weight}
  const totalWeight=holdings.reduce((s,h)=>s+weightOf(h),0)
  const trackedWeight=holdings.reduce((s,h)=>prices[h.symbol]&&h.entry_price?s+weightOf(h):s,0)
  const portfolioReturn=trackedWeight?holdings.reduce((s,h)=>{
    const p=prices[h.symbol];if(!p||!h.entry_price)return s
    const ret=(p.last/h.entry_price-1)*100
    return s+ret*(weightOf(h)/trackedWeight)
  },0):null
  const dayTrackedWeight=holdings.reduce((s,h)=>{const p=prices[h.symbol];return p&&p.prevClose?s+weightOf(h):s},0)
  const dayReturn=dayTrackedWeight?holdings.reduce((s,h)=>{
    const p=prices[h.symbol];if(!p||!p.prevClose)return s
    const ret=(p.last/p.prevClose-1)*100
    return s+ret*(weightOf(h)/dayTrackedWeight)
  },0):null

  return <div className="shell">
    <section className="hero"><div><div className="eyebrow">AI PORTFOLIO AUTOPILOT</div><h1>Describe it. <span>Track it.</span></h1><p className="muted">Give the AI a plain-language description of what you want a portfolio to do. It builds and maintains a real-symbol portfolio against that description, on your command, and logs every change.</p></div></section>
    {msg&&<p className="msg banner">{msg}</p>}
    <div className="grid">
      <section className="panel">
        <div className="panel-title"><h2>YOUR PORTFOLIOS</h2></div>
        <div className="table">{portfolios.map(p=><button key={p.id} className="row" style={{gridTemplateColumns:'1fr'}} onClick={()=>setSelectedId(p.id)}><div><strong>{p.name}</strong>{p.id===selectedId?<span> · selected</span>:null}<span className="how-it-works">{p.description||'No description yet.'}</span></div></button>)}</div>
        {!portfolios.length&&<div className="empty">No portfolios yet. Create your first one below.</div>}
        <form onSubmit={createPortfolio}>
          <label>Portfolio name<input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="e.g. Dividend Compounders" required/></label>
          <label>Description — tell the AI what this portfolio should do<textarea value={newDesc} onChange={e=>setNewDesc(e.target.value)} placeholder="e.g. Aggressive growth tech and AI names, willing to accept high volatility for upside."/></label>
          <button className="run" type="submit">+ CREATE PORTFOLIO</button>
        </form>
      </section>
      <section className="panel">
        {!selected?<div className="empty">Select or create a portfolio to see its detail.</div>:<>
          <div className="portfolio-sticky">
            <div className="panel-title"><h2>{selected.name.toUpperCase()}</h2><span className="muted">Updated {fmtDateTime(selected.updated_at)}</span></div>
            <div className="metrics" style={{gridTemplateColumns:'repeat(6,1fr)'}}>
              <div><span>Holdings</span><b>{holdings.length}</b></div>
              <div><span>Total weight</span><b>{totalWeight.toFixed(1)}%</b></div>
              <div><span>TOTAL RETURN</span><b className={portfolioReturn==null?'':portfolioReturn>=0?'up':'down'}>{portfolioReturn==null?'—':fmtPct(portfolioReturn)}</b></div>
              <div><span>DAYS' RETURN</span><b className={dayReturn==null?'':dayReturn>=0?'up':'down'}>{dayReturn==null?'—':fmtPct(dayReturn)}</b></div>
              <div><span>Created</span><b>{fmtDateTime(selected.created_at)}</b></div>
              <div><span>Last AI research</span><b>{fmtDateTime(log.find(l=>l.action==='ai_rebalance')?.created_at)}</b></div>
            </div>
          </div>

          <div className="section-label">HOLDINGS</div>
          {holdings.length>0&&<div className="row row-head" style={{gridTemplateColumns:'.7fr .7fr .9fr .8fr .8fr .7fr .7fr .6fr'}}>
            <span>Symbol</span>
            <span>Weight</span>
            <span>Added</span>
            <span>Average Cost</span>
            <span>Current Price</span>
            <span>TOTAL RETURN</span>
            <span>DAYS' RETURN</span>
            <span></span>
          </div>}
          <div className="table">{holdings.map(h=>{
            const p=prices[h.symbol]
            const ret=p&&h.entry_price?(p.last/h.entry_price-1)*100:null
            const dayRet=p&&p.prevClose?(p.last/p.prevClose-1)*100:null
            return <div className="row" key={h.id} style={{gridTemplateColumns:'.7fr .7fr .9fr .8fr .8fr .7fr .7fr .6fr'}}>
              <span><b>{h.symbol}</b></span>
              <span>{weightOf(h).toFixed(1)}% weight{h.shares!=null?` · ${h.shares} sh`:''}</span>
              <span>{h.added_by==='ai'?'Added by AI':'Added by you'} · {fmtDateTime(h.added_at)}</span>
              <span>{h.entry_price?`$${h.entry_price.toFixed(2)}`:'not set'}</span>
              <span>{p?`$${p.last.toFixed(2)}`:'loading…'}</span>
              <span className={ret!=null?(ret>=0?'up':'down'):''}>{ret!=null?fmtPct(ret):'—'}</span>
              <span className={dayRet!=null?(dayRet>=0?'up':'down'):''}>{dayRet!=null?fmtPct(dayRet):'—'}</span>
              <button className="ghost" onClick={()=>removeHolding(h)}>REMOVE</button>
            </div>
          })}</div>
          {!holdings.length&&<div className="empty">No holdings yet. Add one manually or let the AI research the portfolio.</div>}

          <div className="section-label">ADD A STOCK</div>
          <form onSubmit={addHolding}>
            <div className="add-holding-grid" style={{marginBottom:10}}>
              <label>Symbol<input value={addSymbol} onChange={e=>setAddSymbol(e.target.value.toUpperCase())} placeholder="AAPL" required/></label>
              <label>Shares owned<input type="number" min={0} step="0.0001" value={addShares} onChange={e=>setAddShares(e.target.value)} placeholder="e.g. 10" required/></label>
              <label>Average cost (optional)<input type="number" min={0} step="0.01" value={addAvgCost} onChange={e=>setAddAvgCost(e.target.value)} placeholder="Live price if blank"/></label>
            </div>
            <button className="run" type="submit" style={{marginTop:0}}>+ ADD</button>
          </form>

          <div className="section-label">DESCRIPTION</div>
          <label>You can change this any time<textarea value={descDraft} onChange={e=>setDescDraft(e.target.value)}/></label>
          <button className="ghost" onClick={saveDescription} disabled={descDraft===selected.description}>SAVE DESCRIPTION</button>

          <div className="section-label">AI RESEARCH</div>
          <button className="run" onClick={runResearch} disabled={researching}>{researching?'RESEARCHING…':'🔍 RESEARCH & REBALANCE NOW'}</button>
          <p className="tiny">Pulls real live/historical prices across a broad multi-sector universe of stocks, scores them against your description (with full AI reasoning when an ANTHROPIC_API_KEY is configured, otherwise a rules-based momentum/volatility screen), and proposes portfolio changes for you to apply.</p>

          {proposal&&<div className="run-detail">
            <h3>Proposed portfolio ({proposal.mode==='ai'?'AI reasoning':'heuristic screen'} · {proposal.universeSize} real candidates scanned)</h3>
            <p>{proposal.summary}</p>
            <div className="table">{proposal.holdings.map((h:any)=><div className="row" key={h.symbol} style={{gridTemplateColumns:'.4fr 2fr'}}><span><b>{h.symbol} · {h.weight}%</b></span><span className="how-it-works">{h.rationale}</span></div>)}</div>
            <div className="run-controls" style={{gridTemplateColumns:'1fr 1fr'}}>
              <button className="run" onClick={applyProposal}>APPLY CHANGES</button>
              <button className="ghost" onClick={()=>setProposal(null)}>DISCARD</button>
            </div>
          </div>}

          <div className="section-label">CHANGE LOG</div>
          <div className="test-list change-log-scroll">{log.map(l=><div className={`test-item ${l.actor==='ai'?'pass':''}`} key={l.id}><div className="test-item-main"><b>{l.actor==='ai'?'🤖 AI':'👤 You'} · {l.action.replace(/_/g,' ')}</b><span>{l.message}</span></div><div className="test-item-stats"><span>{fmtDateTime(l.created_at)}</span></div></div>)}
          {!log.length&&<div className="empty">No changes logged yet.</div>}</div>
        </>}
      </section>
    </div>
  </div>
}
