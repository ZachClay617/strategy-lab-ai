'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Portfolio = { id:string; name:string; description:string; created_at:string; updated_at:string }
type Holding = { id:string; portfolio_id:string; symbol:string; weight:number; added_by:string; added_at:string; entry_price?:number|null; shares?:number|null }
type ClosedTrade = { id:string; portfolio_id:string; symbol:string; shares:number; entry_price:number; exit_price:number; realized_pl:number; opened_at:string; closed_at:string }
type LogEntry = { id:string; created_at:string; actor:string; action:string; message:string; detail:any }

function fmtDateTime(iso?:string){if(!iso)return '—';return new Date(iso).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}
function fmtPct(n:number){return `${n>=0?'+':''}${n.toFixed(2)}%`}
function fmtDollar(n:number){return `${n>=0?'+':'-'}$${Math.abs(n).toFixed(2)}`}

function ReturnChart({points,title}:{points:{date:string;returnPct:number}[];title:string}){
  if(points.length<2)return <div className="chart empty">Not enough price history yet to chart return over time.</div>
  const w=1000,h=320,padL=64,padR=16,padT=20,padB=34
  const values=points.map(p=>p.returnPct)
  const min=Math.min(0,...values),max=Math.max(0,...values)
  const spread=max-min||1,pricePad=spread*.1
  const adjMin=min-pricePad,adjMax=max+pricePad,range=adjMax-adjMin||1
  const x=(i:number)=>padL+(i/(Math.max(points.length-1,1)))*(w-padL-padR)
  const y=(v:number)=>h-padB-((v-adjMin)/range)*(h-padT-padB)
  const path=points.map((p,i)=>`${i===0?'M':'L'}${x(i).toFixed(1)} ${y(p.returnPct).toFixed(1)}`).join(' ')
  const up=points[points.length-1].returnPct>=0
  const gridLines=4
  const timeTickCount=Math.min(points.length,6)
  const timeTicks=Array.from({length:timeTickCount}).map((_,k)=>{const i=Math.round(k*(points.length-1)/Math.max(1,timeTickCount-1));return {i,label:new Date(points[i].date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}})
  return <div className="chart-wrap rh">
    <div className="chart-head"><div><b>{title}</b><span>RETURN % OVER TIME</span></div><strong className={up?'up':'down'}>{fmtPct(points[points.length-1].returnPct)}</strong></div>
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {Array.from({length:gridLines}).map((_,i)=>{const v=adjMin+(range*i)/(gridLines-1);const yy=y(v);return <g key={i}><line x1={padL} x2={w-padR} y1={yy} y2={yy} stroke="#ffffff" strokeOpacity=".06" strokeWidth="1"/><text x={padL-8} y={yy+4} fill="#6b7690" fontSize="11" textAnchor="end">{v.toFixed(1)}%</text></g>})}
      {adjMin<0&&adjMax>0&&<line x1={padL} x2={w-padR} y1={y(0)} y2={y(0)} stroke="#8fa0b8" strokeDasharray="4 4" strokeWidth="1"/>}
      <path d={path} fill="none" stroke="#4fc3f7" strokeWidth="2"/>
      {points.map((p,i)=><g key={`${p.date}-${i}`}><circle cx={x(i)} cy={y(p.returnPct)} r="10" fill="transparent"><title>{`${fmtDateTime(p.date)}\nReturn: ${fmtPct(p.returnPct)}`}</title></circle><circle cx={x(i)} cy={y(p.returnPct)} r="3.5" fill="#ff5000" stroke="#05070d" strokeWidth="1.3" pointerEvents="none"/></g>)}
      {timeTicks.map((t,k)=><text key={k} x={x(t.i)} y={h-10} fill="#6b7690" fontSize="11" textAnchor="middle">{t.label}</text>)}
    </svg>
  </div>
}

export default function Portfolios(){
  const [session,setSession]=useState<any>(null)
  const [portfolios,setPortfolios]=useState<Portfolio[]>([])
  const [selectedId,setSelectedId]=useState<string|null>(null)
  const [holdings,setHoldings]=useState<Holding[]>([])
  const [closedTrades,setClosedTrades]=useState<ClosedTrade[]>([])
  const [allClosedTrades,setAllClosedTrades]=useState<Record<string,ClosedTrade[]>>({})
  const [log,setLog]=useState<LogEntry[]>([])
  const [prices,setPrices]=useState<Record<string,{last:number;prevClose:number|null}>>({})
  const [names,setNames]=useState<Record<string,string>>({})
  const [newName,setNewName]=useState('')
  const [newDesc,setNewDesc]=useState('')
  const [descDraft,setDescDraft]=useState('')
  const [nameDraft,setNameDraft]=useState('')
  const [editingName,setEditingName]=useState(false)
  const [addSymbol,setAddSymbol]=useState('')
  const [addShares,setAddShares]=useState('')
  const [addAvgCost,setAddAvgCost]=useState('')
  const [researching,setResearching]=useState(false)
  const [msg,setMsg]=useState('')
  const [proposal,setProposal]=useState<any>(null)
  const [returnSeries,setReturnSeries]=useState<{date:string;returnPct:number}[]>([])
  const [editingId,setEditingId]=useState<string|null>(null)
  const [editShares,setEditShares]=useState('')
  const [editAvgCost,setEditAvgCost]=useState('')
  const [view,setView]=useState<'overview'|'detail'>('overview')
  const [allHoldings,setAllHoldings]=useState<Record<string,Holding[]>>({})
  const [pendingResearchId,setPendingResearchId]=useState<string|null>(null)
  const [expandedDesc,setExpandedDesc]=useState<Record<string,boolean>>({})

  useEffect(()=>{if(!supabase)return;supabase.auth.getSession().then(({data})=>setSession(data.session));const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>data.subscription.unsubscribe()},[])
  useEffect(()=>{if(session?.user)loadPortfolios()},[session?.user?.id])
  useEffect(()=>{if(selectedId)loadPortfolio(selectedId);else{setHoldings([]);setLog([]);setDescDraft('')}},[selectedId])
  useEffect(()=>{if(holdings.length)loadPrices(holdings.map(h=>h.symbol))},[holdings.map(h=>h.symbol).join(',')])
  useEffect(()=>{
    const symbols=holdings.map(h=>h.symbol).filter(sym=>!(sym in names))
    if(symbols.length)loadNames(symbols)
  },[holdings.map(h=>h.symbol).join(',')])
  useEffect(()=>{if(holdings.length||closedTrades.length)loadReturnSeries(holdings,closedTrades);else setReturnSeries([])},[holdings,closedTrades])
  useEffect(()=>{
    if(!(view==='detail'&&selectedId&&holdings.length))return
    const symbols=holdings.map(h=>h.symbol)
    const id=setInterval(()=>loadPrices(symbols),30000)
    return ()=>clearInterval(id)
  },[view,selectedId,holdings.map(h=>h.symbol).join(',')])
  useEffect(()=>{if(portfolios.length)loadAllHoldings();else setAllHoldings({})},[portfolios.map(p=>p.id).join(',')])
  useEffect(()=>{
    const symbols=Array.from(new Set(Object.values(allHoldings).flat().map(h=>h.symbol)))
    if(symbols.length)loadPrices(symbols)
  },[Object.values(allHoldings).flat().map(h=>h.symbol).join(',')])
  useEffect(()=>{if(pendingResearchId&&selectedId===pendingResearchId){setPendingResearchId(null);runResearch()}},[holdings])

  async function loadPortfolios(){
    if(!supabase||!session?.user)return
    const {data,error}=await supabase.from('portfolios').select('*').eq('user_id',session.user.id).order('created_at',{ascending:false})
    if(error){setMsg(`Could not load portfolios: ${error.message}. Run migration_v9_portfolios.sql in Supabase.`);return}
    setPortfolios((data||[]) as Portfolio[])
  }
  async function loadAllHoldings(){
    if(!supabase||!portfolios.length)return
    const [{data,error},{data:closed,error:closedErr}]=await Promise.all([
      supabase.from('portfolio_holdings').select('*').in('portfolio_id',portfolios.map(p=>p.id)),
      supabase.from('portfolio_realized_trades').select('*').in('portfolio_id',portfolios.map(p=>p.id)),
    ])
    if(!error){
      const grouped:Record<string,Holding[]>={}
      for(const h of (data||[]) as Holding[])(grouped[h.portfolio_id]=grouped[h.portfolio_id]||[]).push(h)
      setAllHoldings(grouped)
    }
    if(!closedErr){
      const groupedClosed:Record<string,ClosedTrade[]>={}
      for(const c of (closed||[]) as ClosedTrade[])(groupedClosed[c.portfolio_id]=groupedClosed[c.portfolio_id]||[]).push(c)
      setAllClosedTrades(groupedClosed)
    }
  }
  async function loadPortfolio(id:string){
    if(!supabase)return
    const [{data:h,error:hErr},{data:l,error:lErr},{data:c,error:cErr}]=await Promise.all([
      supabase.from('portfolio_holdings').select('*').eq('portfolio_id',id).order('weight',{ascending:false}),
      supabase.from('portfolio_log').select('*').eq('portfolio_id',id).order('created_at',{ascending:false}).limit(200),
      supabase.from('portfolio_realized_trades').select('*').eq('portfolio_id',id).order('closed_at',{ascending:true}),
    ])
    if(hErr||lErr){setMsg(`Could not load portfolio detail: ${hErr?.message||lErr?.message}`);return}
    setHoldings((h||[]) as Holding[]);setLog((l||[]) as LogEntry[])
    setClosedTrades(cErr?[]:(c||[]) as ClosedTrade[])
    const p=portfolios.find(x=>x.id===id);setDescDraft(p?.description||'');setNameDraft(p?.name||'')
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
  async function loadNames(symbols:string[]){
    try{
      const r=await fetch(`/api/market?names=${encodeURIComponent(symbols.join(','))}`)
      const j=await r.json()
      if(j&&typeof j==='object')setNames(prev=>({...prev,...j}))
    }catch{}
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
  async function saveName(){
    if(!supabase||!selectedId||!nameDraft.trim())return
    const prev=portfolios.find(p=>p.id===selectedId)?.name||''
    const {error}=await supabase.from('portfolios').update({name:nameDraft.trim(),updated_at:new Date().toISOString()}).eq('id',selectedId)
    if(error){setMsg(`Could not rename portfolio: ${error.message}`);return}
    await addLog(selectedId,'user','name_updated',`Renamed "${prev}" to "${nameDraft.trim()}".`,{before:prev,after:nameDraft.trim()})
    setEditingName(false);await loadPortfolios();await loadPortfolio(selectedId)
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
  async function fetchDailySeries(symbol:string, rangeDays:number):Promise<{date:string;close:number}[]>{
    try{
      const url=`/api/market?symbol=${encodeURIComponent(symbol)}&interval=1d&rangeDays=${rangeDays}`
      const r=await fetch(url)
      const j=await r.json()
      return Array.isArray(j)?j.map((c:any)=>({date:String(c.date).slice(0,10),close:c.close})):[]
    }catch{return []}
  }
  async function loadReturnSeries(list:Holding[],closed:ClosedTrade[]){
    const withEntry=list.filter(h=>h.entry_price)
    if(!withEntry.length&&!closed.length){setReturnSeries([]);return}

    // Snapshots are written every ~15 minutes by a server-side cron job (see
    // /api/cron/portfolio-snapshots) so the chart keeps gaining real data points
    // even while nobody has the site open. They give the recent period fine
    // granularity; older history (before tracking started, or before this
    // feature existed) is backfilled below from daily closes.
    let snapshotPoints:{date:string;returnPct:number}[]=[]
    if(supabase&&selectedId){
      const {data:snaps}=await supabase.from('portfolio_snapshots').select('taken_at,return_pct').eq('portfolio_id',selectedId).order('taken_at',{ascending:true})
      if(snaps?.length)snapshotPoints=snaps.map(s=>({date:s.taken_at as string,returnPct:Number(s.return_pct)}))
    }

    const openDates=withEntry.map(h=>h.added_at)
    const closedDates=closed.map(c=>c.opened_at)
    const allStartDates=[...openDates,...closedDates]
    if(!allStartDates.length){setReturnSeries([]);return}
    const earliest=allStartDates.reduce((min,d)=>d<min?d:min,allStartDates[0])
    const backfillEnd=snapshotPoints.length?snapshotPoints[0].date.slice(0,10):null
    const daysSince=Math.max(5,Math.ceil((Date.now()-new Date(earliest).getTime())/86400000)+2)
    const rangeDays=Math.min(3650,daysSince)
    const symbolsNeeded=Array.from(new Set([...withEntry.map(h=>h.symbol),...closed.map(c=>c.symbol)]))
    const perSymbol=await Promise.all(symbolsNeeded.map(async sym=>({symbol:sym,series:await fetchDailySeries(sym,rangeDays)})))
    const closeAt=(sym:string,dateKey:string):number|null=>{
      const s=perSymbol.find(x=>x.symbol===sym);if(!s)return null
      let close:number|null=null
      for(const c of s.series){if(c.date<=dateKey)close=c.close;else break}
      return close
    }
    const dateSet=new Set<string>()
    for(const s of perSymbol)for(const c of s.series)if(!backfillEnd||c.date<backfillEnd)dateSet.add(c.date)
    const dates=Array.from(dateSet).sort()
    // All-time return at each date: unrealized gain on still-open positions
    // (priced as of that date) plus realized gain already locked in from
    // trades closed by that date, as a share of everything invested by then —
    // so a sold position's contribution to performance never disappears.
    const backfillPoints:{date:string;returnPct:number}[]=[]
    for(const dateKey of dates){
      let gainDollar=0,costBasis=0
      for(const h of withEntry){
        if(h.added_at.slice(0,10)>dateKey)continue
        const sh=h.shares!=null?h.shares:1
        costBasis+=h.entry_price!*sh
        const close=closeAt(h.symbol,dateKey)
        if(close==null)continue
        gainDollar+=(close-h.entry_price!)*sh
      }
      for(const c of closed){
        if(c.opened_at.slice(0,10)>dateKey)continue
        costBasis+=c.entry_price*c.shares
        if(dateKey>=c.closed_at.slice(0,10)){gainDollar+=c.realized_pl;continue}
        const close=closeAt(c.symbol,dateKey)
        if(close==null)continue
        gainDollar+=(close-c.entry_price)*c.shares
      }
      if(costBasis>0)backfillPoints.push({date:dateKey+'T12:00:00.000Z',returnPct:gainDollar/costBasis*100})
    }
    setReturnSeries([...backfillPoints,...snapshotPoints])
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
  function startEditHolding(h:Holding){
    setEditingId(h.id)
    setEditShares(h.shares!=null?String(h.shares):'')
    setEditAvgCost(h.entry_price!=null?String(h.entry_price):'')
  }
  function cancelEditHolding(){
    setEditingId(null);setEditShares('');setEditAvgCost('')
  }
  async function saveEditHolding(h:Holding){
    if(!supabase||!selectedId)return
    const sharesNum=editShares.trim()?Number(editShares):null
    if(editShares.trim()&&(!sharesNum||sharesNum<=0)){setMsg('Enter a valid number of shares.');return}
    const costNum=editAvgCost.trim()?Number(editAvgCost):null
    if(editAvgCost.trim()&&(!costNum||costNum<=0)){setMsg('Enter a valid average cost.');return}
    const {error}=await supabase.from('portfolio_holdings').update({shares:sharesNum,entry_price:costNum}).eq('id',h.id)
    if(error){setMsg(`Could not update ${h.symbol}: ${error.message}`);return}
    await addLog(selectedId,'user','holding_edited',`Updated ${h.symbol} · ${sharesNum!=null?`${sharesNum} shares`:'no shares set'}${costNum!=null?`, average cost $${costNum.toFixed(2)}`:''}.`,{symbol:h.symbol,shares:sharesNum,entryPrice:costNum})
    cancelEditHolding();await loadPortfolio(selectedId)
  }
  async function removeHolding(h:Holding){
    if(!supabase||!selectedId)return
    const sh=h.shares!=null?h.shares:1
    const exitPrice=prices[h.symbol]?.last??(await fetchLastPrice(h.symbol))
    if(h.entry_price!=null&&exitPrice!=null&&session?.user){
      const realizedPl=(exitPrice-h.entry_price)*sh
      await supabase.from('portfolio_realized_trades').insert({
        portfolio_id:selectedId,user_id:session.user.id,symbol:h.symbol,shares:sh,
        entry_price:h.entry_price,exit_price:exitPrice,realized_pl:realizedPl,opened_at:h.added_at,
      })
    }
    const {error}=await supabase.from('portfolio_holdings').delete().eq('id',h.id)
    if(error){setMsg(`Could not remove ${h.symbol}: ${error.message}`);return}
    await addLog(selectedId,'user','holding_removed',`Removed ${h.symbol} (was ${h.shares!=null?`${h.shares} shares`:`${h.weight}% weight`}).`,{symbol:h.symbol,weight:h.weight,shares:h.shares})
    await loadPortfolio(selectedId)
  }
  async function deleteClosedTrade(ct:ClosedTrade){
    if(!supabase||!selectedId)return
    const {error}=await supabase.from('portfolio_realized_trades').delete().eq('id',ct.id)
    if(error){setMsg(`Could not remove that trade from history: ${error.message}`);return}
    await addLog(selectedId,'user','trade_history_removed',`Removed ${ct.symbol} (${ct.shares} sh, ${fmtDollar(ct.realized_pl)}) from realized trade history — no longer counted toward total return. Use this if a holding was added by accident.`,{symbol:ct.symbol,shares:ct.shares,entryPrice:ct.entry_price,exitPrice:ct.exit_price,realizedPl:ct.realized_pl})
    await loadPortfolio(selectedId)
  }
  async function clearTradeHistory(){
    if(!supabase||!selectedId||!closedTrades.length)return
    const {error}=await supabase.from('portfolio_realized_trades').delete().eq('portfolio_id',selectedId)
    if(error){setMsg(`Could not clear trade history: ${error.message}`);return}
    await addLog(selectedId,'user','trade_history_cleared',`Cleared all ${closedTrades.length} realized trade(s) from this portfolio's history — total return no longer includes past sells.`,{count:closedTrades.length})
    await loadPortfolio(selectedId)
  }
  function toggleDesc(id:string,e:React.MouseEvent){e.stopPropagation();setExpandedDesc(prev=>({...prev,[id]:!prev[id]}))}
  function viewPortfolio(id:string){setSelectedId(id);setView('detail');setMsg('')}
  function backToOverview(){setView('overview');setMsg('')}
  function researchPortfolio(id:string){
    const portfolio=portfolios.find(p=>p.id===id)
    if(!portfolio?.description.trim()){setMsg('Add a description first so the AI knows what this portfolio should do.');return}
    setView('detail')
    if(selectedId===id)runResearch()
    else{setSelectedId(id);setPendingResearchId(id)}
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
  const effectiveShares=(h:Holding)=>h.shares!=null?h.shares:1
  const holdingValue=(h:Holding)=>{const p=prices[h.symbol];return p?effectiveShares(h)*p.last:null}
  const sharesValueTotal=holdings.reduce((s,h)=>{const v=holdingValue(h);return v!=null?s+v:s},0)
  const weightOf=(h:Holding)=>{const v=holdingValue(h);return v!=null&&sharesValueTotal>0?v/sharesValueTotal*100:h.weight}
  const totalValue=sharesValueTotal
  const totalWeight=holdings.reduce((s,h)=>s+weightOf(h),0)
  // All-time total return: unrealized gain/loss on currently open holdings
  // PLUS realized gain/loss already locked in from past (sold) trades, as a
  // share of everything ever invested — so closing a position doesn't erase
  // its contribution to the portfolio's real, all-time performance.
  const openCostBasis=holdings.reduce((s,h)=>{const p=prices[h.symbol];return p&&h.entry_price?s+h.entry_price*effectiveShares(h):s},0)
  const openGainDollar=holdings.reduce((s,h)=>{const p=prices[h.symbol];return p&&h.entry_price?s+(p.last-h.entry_price)*effectiveShares(h):s},0)
  const realizedCostBasis=closedTrades.reduce((s,c)=>s+c.entry_price*c.shares,0)
  const realizedGainDollar=closedTrades.reduce((s,c)=>s+c.realized_pl,0)
  const portfolioCostBasis=openCostBasis+realizedCostBasis
  const portfolioReturnDollar=openGainDollar+realizedGainDollar
  const portfolioReturn=portfolioCostBasis>0?portfolioReturnDollar/portfolioCostBasis*100:null
  const liveReturnSeries=(()=>{
    if(portfolioReturn==null)return returnSeries
    const nowPoint={date:new Date().toISOString(),returnPct:portfolioReturn}
    const last=returnSeries[returnSeries.length-1]
    if(last&&new Date(last.date).getTime()>=new Date(nowPoint.date).getTime())return returnSeries
    return [...returnSeries,nowPoint]
  })()
  const dayTrackedWeight=holdings.reduce((s,h)=>{const p=prices[h.symbol];return p&&p.prevClose?s+weightOf(h):s},0)
  const dayReturn=dayTrackedWeight?holdings.reduce((s,h)=>{
    const p=prices[h.symbol];if(!p||!p.prevClose)return s
    const ret=(p.last/p.prevClose-1)*100
    return s+ret*(weightOf(h)/dayTrackedWeight)
  },0):null
  const dayReturnDollar=holdings.reduce((s,h)=>{
    const p=prices[h.symbol];if(!p||!p.prevClose)return s
    return s+(p.last-p.prevClose)*effectiveShares(h)
  },0)

  function sumMetrics(list:Holding[],closed:ClosedTrade[]=[]){
    let value=0,costBasis=0,returnDollar=0,priorValue=0,dayReturnDollar=0
    let unrealizedCostBasis=0,unrealizedDollar=0
    for(const h of list){
      const p=prices[h.symbol];if(!p)continue
      const sh=h.shares!=null?h.shares:1
      value+=sh*p.last
      if(h.entry_price){
        costBasis+=h.entry_price*sh;returnDollar+=(p.last-h.entry_price)*sh
        unrealizedCostBasis+=h.entry_price*sh;unrealizedDollar+=(p.last-h.entry_price)*sh
      }
      if(p.prevClose){priorValue+=p.prevClose*sh;dayReturnDollar+=(p.last-p.prevClose)*sh}
    }
    let realizedCostBasis=0,realizedDollar=0
    for(const c of closed){
      costBasis+=c.entry_price*c.shares;returnDollar+=c.realized_pl
      realizedCostBasis+=c.entry_price*c.shares;realizedDollar+=c.realized_pl
    }
    return {
      holdings:list.length,
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
  }
  const overview=sumMetrics(Object.values(allHoldings).flat(),Object.values(allClosedTrades).flat())

  return <div className="shell portfolios-page">
    <section className="hero"><div><div className="eyebrow">AI PORTFOLIO AUTOPILOT</div><h1>Describe it. Track it. <span>Visualize it.</span></h1><p className="muted">Give the AI a plain-language description of what you want a portfolio to do. It builds and maintains a real-symbol portfolio against that description, on your command, and logs every change.</p></div></section>
    {msg&&<p className="msg banner">{msg}</p>}
    <div className="grid">
      <section className="panel">
        <div className="panel-title"><h2>YOUR PORTFOLIOS</h2>{view==='detail'&&<button className="ghost" onClick={backToOverview}>← OVERVIEW</button>}</div>
        <div className="table">{portfolios.map(p=><button key={p.id} className="row" style={{gridTemplateColumns:'1fr'}} onClick={()=>viewPortfolio(p.id)}><div><strong>{p.name}</strong>{p.id===selectedId&&view==='detail'?<span> · selected</span>:null}<span className="how-it-works">{p.description||'No description yet.'}</span></div></button>)}</div>
        {!portfolios.length&&<div className="empty">No portfolios yet. Create your first one below.</div>}
        <form onSubmit={createPortfolio}>
          <label>Portfolio name<input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="e.g. Dividend Compounders" required/></label>
          <label>Description — tell the AI what this portfolio should do<textarea value={newDesc} onChange={e=>setNewDesc(e.target.value)} placeholder="e.g. Aggressive growth tech and AI names, willing to accept high volatility for upside."/></label>
          <button className="run" type="submit">+ MAKE A-TAMP GENERATE PORTFOLIO</button>
        </form>
      </section>
      <section className="panel">
        {view==='overview'?<>
          <div className="panel-title"><h2>OVERVIEW</h2></div>
          <div className="metrics" style={{gridTemplateColumns:'repeat(6,1fr)'}}>
            <div><span>Total holdings tracked</span><b>{overview.holdings}</b></div>
            <div><span>Total value</span><b>{overview.value>0?`$${overview.value.toFixed(2)}`:'—'}</b></div>
            <div><span>TOTAL RETURN</span><b className={overview.returnPct==null?'':overview.returnPct>=0?'up':'down'}>{overview.returnPct==null?'—':`${fmtPct(overview.returnPct)} (${fmtDollar(overview.returnDollar)})`}</b></div>
            <div><span>UNREALIZED RETURN</span><b className={overview.unrealizedPct==null?'':overview.unrealizedPct>=0?'up':'down'}>{overview.unrealizedPct==null?'—':`${fmtPct(overview.unrealizedPct)} (${fmtDollar(overview.unrealizedDollar)})`}</b></div>
            <div><span>REALIZED RETURN</span><b className={overview.realizedPct==null?'':overview.realizedPct>=0?'up':'down'}>{overview.realizedPct==null?'—':`${fmtPct(overview.realizedPct)} (${fmtDollar(overview.realizedDollar)})`}</b></div>
            <div><span>DAYS' RETURN</span><b className={overview.dayReturnPct==null?'':overview.dayReturnPct>=0?'up':'down'}>{overview.dayReturnPct==null?'—':`${fmtPct(overview.dayReturnPct)} (${fmtDollar(overview.dayReturnDollar)})`}</b></div>
          </div>

          <div className="section-label overview-label"><b>YOUR PORTFOLIOS</b></div>
          <div className="portfolio-cards">{portfolios.map(p=>{
            const m=sumMetrics(allHoldings[p.id]||[],allClosedTrades[p.id]||[])
            const retUp=m.returnPct!=null&&m.returnPct>=0
            const dayUp=m.dayReturnPct!=null&&m.dayReturnPct>=0
            return <div className={`portfolio-card ${m.returnPct==null?'':retUp?'card-up':'card-down'}`} key={p.id}>
              <div className="portfolio-card-glow"/>
              <div className="portfolio-card-grid"/>
              <div className="portfolio-card-head">
                <div>
                  <div className="portfolio-card-name">{p.name}</div>
                  <div className="portfolio-card-desc">
                    <span className={`how-it-works ${expandedDesc[p.id]?'expanded':'collapsed'}`}>{p.description||'No description yet.'}</span>
                    {p.description&&<button className="desc-toggle" onClick={e=>toggleDesc(p.id,e)} aria-label={expandedDesc[p.id]?'Collapse description':'Expand description'}>{expandedDesc[p.id]?'▲':'▼'}</button>}
                  </div>
                </div>
                <div className={`portfolio-card-badge ${m.returnPct==null?'':retUp?'up':'down'}`}>{m.returnPct==null?'UNTRACKED':retUp?'▲ UP':'▼ DOWN'}</div>
              </div>
              <div className="portfolio-card-stats">
                <div><span>Holdings</span><b>{m.holdings}</b></div>
                <div><span>Total value</span><b>{m.value>0?`$${m.value.toFixed(2)}`:'—'}</b></div>
                <div><span>TOTAL RETURN</span><b className={m.returnPct==null?'':retUp?'up':'down'}>{m.returnPct==null?'—':fmtPct(m.returnPct)}</b><em className={m.returnPct==null?'':retUp?'up':'down'}>{m.returnPct==null?'':fmtDollar(m.returnDollar)}</em></div>
                <div><span>DAYS' RETURN</span><b className={m.dayReturnPct==null?'':dayUp?'up':'down'}>{m.dayReturnPct==null?'—':fmtPct(m.dayReturnPct)}</b><em className={m.dayReturnPct==null?'':dayUp?'up':'down'}>{m.dayReturnPct==null?'':fmtDollar(m.dayReturnDollar)}</em></div>
              </div>
              <div className="portfolio-card-foot">
                <span>Created {fmtDateTime(p.created_at)}</span>
                <div className="portfolio-card-actions" onClick={e=>e.stopPropagation()}>
                  <button className="run" style={{marginTop:0}} onClick={()=>viewPortfolio(p.id)}>OPEN →</button>
                  <button className="ghost" onClick={()=>researchPortfolio(p.id)} title="Costs real money — calls a paid AI model">A-TAMP</button>
                </div>
              </div>
            </div>
          })}</div>
          {!portfolios.length&&<div className="empty">No portfolios yet. Create your first one on the left.</div>}
        </>:!selected?<div className="empty">Select or create a portfolio to see its detail.</div>:<>
          <div className="portfolio-sticky">
            <div className="panel-title">
              {editingName?<div className="portfolio-name-edit"><input value={nameDraft} onChange={e=>setNameDraft(e.target.value)} autoFocus/><button className="ghost" onClick={saveName} disabled={!nameDraft.trim()}>SAVE</button><button className="ghost" onClick={()=>{setEditingName(false);setNameDraft(selected.name)}}>CANCEL</button></div>:<h2>{selected.name.toUpperCase()}<button className="ghost portfolio-name-btn" onClick={()=>{setNameDraft(selected.name);setEditingName(true)}} title="Rename portfolio">RENAME</button></h2>}
              <span className="muted">Updated {fmtDateTime(selected.updated_at)}</span>
            </div>
            <div className="metrics" style={{gridTemplateColumns:'repeat(7,1fr)'}}>
              <div><span>Holdings</span><b>{holdings.length}</b></div>
              <div><span>Total weight</span><b>{totalWeight.toFixed(1)}%</b></div>
              <div><span>Total value</span><b>{sharesValueTotal>0?`$${totalValue.toFixed(2)}`:'—'}</b></div>
              <div><span>TOTAL RETURN</span><b className={portfolioReturn==null?'':portfolioReturn>=0?'up':'down'}>{portfolioReturn==null?'—':`${fmtPct(portfolioReturn)} (${fmtDollar(portfolioReturnDollar)})`}</b></div>
              <div><span>DAYS' RETURN</span><b className={dayReturn==null?'':dayReturn>=0?'up':'down'}>{dayReturn==null?'—':`${fmtPct(dayReturn)} (${fmtDollar(dayReturnDollar)})`}</b></div>
              <div><span>Created</span><b>{fmtDateTime(selected.created_at)}</b></div>
              <div><span>Last AI research</span><b>{fmtDateTime(log.find(l=>l.action==='ai_rebalance')?.created_at)}</b></div>
            </div>
          </div>

          <div className="section-label">HOLDINGS</div>
          {holdings.length>0&&<div className="row row-head" style={{gridTemplateColumns:'minmax(0,.8fr) minmax(0,.55fr) minmax(0,.55fr) minmax(0,.7fr) minmax(0,.7fr) minmax(0,.75fr) minmax(0,.65fr) minmax(0,1.1fr) minmax(0,1.1fr) minmax(0,1fr)'}}>
            <span>Symbol</span>
            <span>Shares</span>
            <span>Weight</span>
            <span>Equity</span>
            <span>Added</span>
            <span>Average Cost</span>
            <span>Current Price</span>
            <span>TOTAL RETURN</span>
            <span>DAYS' RETURN</span>
            <span></span>
          </div>}
          <div className="table">{holdings.map(h=>{
            const p=prices[h.symbol]
            const sh=effectiveShares(h)
            const equity=holdingValue(h)
            const ret=p&&h.entry_price?(p.last/h.entry_price-1)*100:null
            const retDollar=p&&h.entry_price?(p.last-h.entry_price)*sh:null
            const dayRet=p&&p.prevClose?(p.last/p.prevClose-1)*100:null
            const dayRetDollar=p&&p.prevClose?(p.last-p.prevClose)*sh:null
            const isEditing=editingId===h.id
            return <div className="row" key={h.id} style={{gridTemplateColumns:'minmax(0,.8fr) minmax(0,.55fr) minmax(0,.55fr) minmax(0,.7fr) minmax(0,.7fr) minmax(0,.75fr) minmax(0,.65fr) minmax(0,1.1fr) minmax(0,1.1fr) minmax(0,1fr)'}}>
              <span style={{minWidth:0}}><b>{h.symbol}</b>{names[h.symbol]&&<span className="how-it-works" style={{marginTop:2,whiteSpace:'normal',wordBreak:'break-word'}}>{names[h.symbol]}</span>}</span>
              <span>{isEditing?<input type="number" min={0} step="0.0001" value={editShares} onChange={e=>setEditShares(e.target.value)} placeholder="1"/>:(h.shares!=null?h.shares:'1 (default)')}</span>
              <span>{weightOf(h).toFixed(1)}%</span>
              <span>{equity!=null?`$${equity.toFixed(2)}`:'—'}</span>
              <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.added_by==='ai'?'Added by AI':'Added by you'} · {fmtDateTime(h.added_at)}</span>
              <span>{isEditing?<input type="number" min={0} step="0.01" value={editAvgCost} onChange={e=>setEditAvgCost(e.target.value)} placeholder="not set"/>:(h.entry_price?`$${h.entry_price.toFixed(2)}`:'not set')}</span>
              <span>{p?`$${p.last.toFixed(2)}`:'loading…'}</span>
              <span className={ret!=null?(ret>=0?'up':'down'):''} style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ret!=null?`${fmtPct(ret)} (${fmtDollar(retDollar!)})`:'—'}</span>
              <span className={dayRet!=null?(dayRet>=0?'up':'down'):''} style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{dayRet!=null?`${fmtPct(dayRet)} (${fmtDollar(dayRetDollar!)})`:'—'}</span>
              {isEditing?<div className="holding-actions"><button className="ghost" onClick={()=>saveEditHolding(h)}>SAVE</button><button className="ghost" onClick={cancelEditHolding}>CANCEL</button></div>:<div className="holding-actions"><button className="ghost" onClick={()=>startEditHolding(h)}>EDIT</button><button className="ghost" onClick={()=>removeHolding(h)}>REMOVE</button></div>}
            </div>
          })}</div>
          {!holdings.length&&<div className="empty">No holdings yet. Add one manually or let the AI research the portfolio.</div>}

          <div className="panel-title" style={{marginBottom:8,marginTop:18}}>
            <h2 className="section-label" style={{margin:0}}>TRADE HISTORY (SOLD POSITIONS)</h2>
            {closedTrades.length>0&&<button className="ghost" onClick={clearTradeHistory}>CLEAR ALL</button>}
          </div>
          {closedTrades.length>0&&<>
            <p className="tiny">Counted toward TOTAL RETURN and REALIZED RETURN above and in the chart below. Added a stock by accident and sold it to clean up? Remove it here so it stops being counted.</p>
            <div className="row row-head" style={{gridTemplateColumns:'.7fr .6fr .8fr .8fr 1.1fr 1fr .6fr'}}>
              <span>Symbol</span>
              <span>Shares</span>
              <span>Entry</span>
              <span>Exit</span>
              <span>Realized P/L</span>
              <span>Closed</span>
              <span></span>
            </div>
            <div className="table">{closedTrades.map(ct=>{
              const pl=ct.realized_pl
              const plPct=ct.entry_price>0?(ct.exit_price/ct.entry_price-1)*100:null
              return <div className="row" key={ct.id} style={{gridTemplateColumns:'.7fr .6fr .8fr .8fr 1.1fr 1fr .6fr'}}>
                <span><b>{ct.symbol}</b></span>
                <span>{ct.shares}</span>
                <span>${ct.entry_price.toFixed(2)}</span>
                <span>${ct.exit_price.toFixed(2)}</span>
                <span className={pl>=0?'up':'down'}>{fmtDollar(pl)}{plPct!=null?` (${fmtPct(plPct)})`:''}</span>
                <span>{fmtDateTime(ct.closed_at)}</span>
                <button className="ghost" onClick={()=>deleteClosedTrade(ct)} title="Remove this trade so it no longer counts toward total return">REMOVE</button>
              </div>
            })}</div>
          </>}
          {!closedTrades.length&&<div className="empty">No closed trades yet — sells will show up here.</div>}

          <div className="section-label">RETURN OVER TIME</div>
          <ReturnChart points={liveReturnSeries} title={`${selected.name.toUpperCase()} · TOTAL RETURN`}/>

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

          <div className="section-label">A-TAMP AI RESEARCH</div>
          <p className="field-warning">Running this costs real money — it calls a paid AI model and pulls live market data on every run.</p>
          <button className="run" onClick={runResearch} disabled={researching}>{researching?'A-TAMP IS PRINTING…':'LET A-TAMP RESEARCH & REBALANCE'}</button>
          <p className="tiny">A-Tamp (Autonomous Trading Agent Money Printer) pulls real live/historical prices across a broad multi-sector universe of stocks, scores them against your description (with full AI reasoning when an ANTHROPIC_API_KEY is configured, otherwise a rules-based momentum/volatility screen), and proposes portfolio changes for you to apply.</p>

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
          <div className="test-list change-log-scroll">{log.map(l=><div className={`test-item ${l.actor==='ai'?'pass':''}`} key={l.id}><div className="test-item-main"><b>{l.actor==='ai'?'AI':'You'} · {l.action.replace(/_/g,' ')}</b><span>{l.message}</span></div><div className="test-item-stats"><span>{fmtDateTime(l.created_at)}</span></div></div>)}
          {!log.length&&<div className="empty">No changes logged yet.</div>}</div>
        </>}
      </section>
    </div>
  </div>
}
