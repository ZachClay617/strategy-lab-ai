'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { evaluateSymbolSignals, describeFamily } from '@/lib/strategySignals'
import LiveChart, { ChartMarker } from '@/app/components/LiveChart'
import type { Candle } from '@/lib/market'

type WatchItem = { id:string; symbol:string; market:string }
type FavStrategy = { id:string; name:string; family:string; parameters:any; symbol:string; market:string }
type Position = { id:string; strategy_id:string; entry_price:number; opened_at:string; status:string }
type NotifRow = { id:string; strategy_id:string|null; action:'buy'|'sell'; price:number|null; created_at:string }

const markets=['Stocks','Crypto']
const key=(symbol:string,market:string)=>`${symbol}::${market}`
const RETRY_MSG='Live data temporarily unavailable — retrying…'

function fmtPrice(n:number){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n)}
function fmtDateTime(iso?:string){if(!iso)return '—';return new Date(iso).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}

export default function TradeSignalsPage(){
  const [session,setSession]=useState<any>(null)
  const [watchlist,setWatchlist]=useState<WatchItem[]>([])
  const [activeKey,setActiveKey]=useState<string|null>(null)
  const [newSymbol,setNewSymbol]=useState('')
  const [newMarket,setNewMarket]=useState('Stocks')
  const [adding,setAdding]=useState(false)
  const [addError,setAddError]=useState('')
  const [candlesByKey,setCandlesByKey]=useState<Record<string,Candle[]>>({})
  const [errorByKey,setErrorByKey]=useState<Record<string,string|null>>({})
  const [favStrategies,setFavStrategies]=useState<FavStrategy[]>([])
  const [positions,setPositions]=useState<Position[]>([])
  const [recentSignals,setRecentSignals]=useState<NotifRow[]>([])
  const [lastChecked,setLastChecked]=useState<string>('')
  const [symbolNames,setSymbolNames]=useState<Record<string,string>>({})
  const [cronStaleMinutes,setCronStaleMinutes]=useState<number|null>(null)
  const [closingId,setClosingId]=useState<string|null>(null)

  useEffect(()=>{
    if(!supabase)return
    supabase.auth.getSession().then(({data})=>setSession(data.session))
    const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s))
    return ()=>data.subscription.unsubscribe()
  },[])

  async function loadWatchlist(){
    if(!supabase||!session?.user)return
    const {data}=await supabase.from('watchlist_symbols').select('id,symbol,market').eq('user_id',session.user.id).order('created_at',{ascending:true})
    const list=(data||[]) as WatchItem[]
    setWatchlist(list)
    setActiveKey(prev=>prev&&list.some(w=>key(w.symbol,w.market)===prev)?prev:(list[0]?key(list[0].symbol,list[0].market):null))
  }
  useEffect(()=>{loadWatchlist()},[session?.user?.id])

  async function addToWatchlist(e:React.FormEvent){
    e.preventDefault()
    if(!supabase||!session?.user)return
    const symbol=newSymbol.trim().toUpperCase()
    if(!symbol)return
    setAdding(true);setAddError('')
    const {error}=await supabase.from('watchlist_symbols').insert({user_id:session.user.id,symbol,market:newMarket})
    setAdding(false)
    if(error){setAddError(error.code==='23505'?`${symbol} (${newMarket}) is already on your watchlist.`:error.message);return}
    setNewSymbol('')
    await loadWatchlist()
    setActiveKey(key(symbol,newMarket))
  }

  // Look up company names for any watched symbols we don't have one for yet.
  useEffect(()=>{
    if(!session?.user||!watchlist.length)return
    const missing=Array.from(new Set(watchlist.map(w=>w.symbol))).filter(s=>!(s in symbolNames))
    if(!missing.length)return
    let dead=false
    fetch(`/api/market?names=${encodeURIComponent(missing.join(','))}`).then(r=>r.json()).then(j=>{if(!dead&&j&&typeof j==='object')setSymbolNames(prev=>({...prev,...j}))}).catch(()=>{})
    return()=>{dead=true}
  },[session?.user?.id,watchlist])

  // Warns if the always-on background job (GitHub Actions, every ~5 min) has
  // gone stale — it auto-disables after 60 days of repo inactivity, and a
  // CRON_SECRET mismatch between GitHub and Vercel fails it silently. This is
  // the only signal the user gets that background monitoring stopped, since
  // nothing emails/texts on it; missing entirely (migration not run yet, or
  // the job has genuinely never fired) is treated as "unknown," not "stale."
  useEffect(()=>{
    if(!supabase||!session?.user)return
    let dead=false
    const check=async()=>{
      const {data}=await supabase!.from('cron_heartbeats').select('last_run_at').eq('name','live-signals').maybeSingle()
      if(dead)return
      setCronStaleMinutes(data?.last_run_at?Math.round((Date.now()-new Date(data.last_run_at).getTime())/60000):null)
    }
    check()
    const id=setInterval(check,120000)
    return ()=>{dead=true;clearInterval(id)}
  },[session?.user?.id])

  // Lets the user close a position early, before any sell signal fires —
  // e.g. they want out ahead of earnings, or just changed their mind. Records
  // it as an already-acknowledged sell notification (not a pending one the
  // user would have to separately confirm) so it still shows up in history.
  async function closePositionManually(pos:Position, strat:FavStrategy){
    if(!supabase||!session?.user)return
    setClosingId(pos.id)
    const liveClose=candlesByKey[key(strat.symbol,strat.market)]?.slice(-1)[0]?.close ?? pos.entry_price
    await supabase.from('live_positions').update({status:'closed',exit_price:liveClose,closed_at:new Date().toISOString()}).eq('id',pos.id)
    await supabase.from('trade_notifications').insert({
      user_id:session.user.id,strategy_id:strat.id,strategy_name:strat.name,symbol:strat.symbol,market:strat.market,
      action:'sell',price:liveClose,reason:'Closed manually — you exited this position early, before a sell signal fired.',
      position_id:pos.id,acknowledged:true
    })
    setPositions(prev=>prev.filter(p=>p.id!==pos.id))
    setClosingId(null)
  }

  async function removeFromWatchlist(id:string){
    if(!supabase)return
    await supabase.from('watchlist_symbols').delete().eq('id',id)
    await loadWatchlist()
  }

  // Poll live candles for every watched ticker in parallel, then run the
  // signal engine against each one — this is what lets the site look for
  // buys and sells on multiple stocks at once instead of just the ticker
  // currently shown in the chart. (The server cron covers the same ground
  // even when this page isn't open at all.)
  useEffect(()=>{
    if(!supabase||!session?.user||!watchlist.length)return
    let dead=false
    const tick=async()=>{
      // Firing every watchlisted symbol's request at once in a single burst is far
      // more likely to trip the upstream market data provider's rate limiting than
      // the research page's single-symbol fetch, which was making this page's live
      // data noticeably less reliable. A small stagger spreads the same requests
      // out over ~2s instead of hitting the provider all at once.
      await Promise.all(watchlist.map(async (w,idx)=>{
        if(idx>0)await new Promise(res=>setTimeout(res,idx*220))
        if(dead)return
        const k=key(w.symbol,w.market)
        try{
          const r=await fetch(`/api/market?symbol=${encodeURIComponent(w.symbol)}&live=1`)
          const j=await r.json()
          if(dead)return
          if(Array.isArray(j)&&j.length){
            setCandlesByKey(prev=>({...prev,[k]:j}))
            setErrorByKey(prev=>({...prev,[k]:null}))
            // Isolated from the candle-fetch success above: a failure here (a bad
            // saved strategy, an RLS/schema issue, whatever) must never overwrite
            // the error state we just cleared — otherwise a working market-data
            // fetch gets permanently mislabeled as "unavailable" every single poll
            // because of something unrelated to fetching candles.
            try{await evaluateSymbolSignals(supabase!,session.user.id,w.symbol,w.market,j)}
            catch(e){console.error(`Signal check failed for ${w.symbol}`,e)}
          } else if(j?.error==='invalid_ticker'){
            setErrorByKey(prev=>({...prev,[k]:j.message||`"${w.symbol}" is not a recognized ticker symbol.`}))
          } else {
            // Any other failure (upstream fetch error, bad JSON, etc.) used to fall
            // through silently, leaving the chart stuck on "Waiting for market
            // data…" forever with no indication anything was wrong. Surface it —
            // including the raw server error text — right on the page, so
            // diagnosing this never again requires opening dev tools.
            setErrorByKey(prev=>({...prev,[k]:j?.error?`${RETRY_MSG} (${String(j.error).slice(0,160)})`:RETRY_MSG}))
          }
        }catch(e){
          if(!dead)setErrorByKey(prev=>({...prev,[k]:`${RETRY_MSG} (${String((e as any)?.message||e).slice(0,160)})`}))
        }
      }))
      if(!dead)setLastChecked(new Date().toLocaleTimeString())
    }
    tick()
    const id=setInterval(tick,15000)
    return ()=>{dead=true;clearInterval(id)}
  },[session?.user?.id,watchlist])

  // Load every favorited strategy that matches any watched ticker.
  useEffect(()=>{
    if(!supabase||!session?.user||!watchlist.length){setFavStrategies([]);return}
    let dead=false
    const load=async()=>{
      const {data}=await supabase!.from('strategies').select('id,name,family,parameters,symbol,market').eq('user_id',session.user.id).eq('favorite',true)
      if(dead)return
      const watched=new Set(watchlist.map(w=>key(w.symbol,w.market)))
      setFavStrategies(((data||[]) as FavStrategy[]).filter(s=>watched.has(key(s.symbol,s.market))))
    }
    load()
    const id=setInterval(load,20000)
    return ()=>{dead=true;clearInterval(id)}
  },[session?.user?.id,watchlist])

  // Load open positions + recent signals for those strategies.
  useEffect(()=>{
    if(!supabase||!session?.user||!favStrategies.length){setPositions([]);setRecentSignals([]);return}
    let dead=false
    const ids=favStrategies.map(f=>f.id)
    const load=async()=>{
      const [{data:pos},{data:sig}]=await Promise.all([
        supabase!.from('live_positions').select('id,strategy_id,entry_price,opened_at,status').in('strategy_id',ids).eq('status','open'),
        supabase!.from('trade_notifications').select('id,strategy_id,action,price,created_at').in('strategy_id',ids).order('created_at',{ascending:false}).limit(20)
      ])
      if(dead)return
      setPositions((pos||[]) as Position[]);setRecentSignals((sig||[]) as NotifRow[])
    }
    load()
    const id=setInterval(load,15000)
    return ()=>{dead=true;clearInterval(id)}
  },[session?.user?.id,favStrategies])

  if(!supabase)return <div className="shell"><p className="msg banner">Add Supabase environment variables first.</p></div>
  if(!session)return <div className="shell"><p className="msg banner">Log in on the <a href="/research">Research</a> page first, then come back here.</p></div>

  const active=watchlist.find(w=>key(w.symbol,w.market)===activeKey)||null
  const activeCandles=active?candlesByKey[key(active.symbol,active.market)]||[]:[]
  const activeStrategyIds=new Set(favStrategies.filter(s=>active&&s.symbol===active.symbol&&s.market===active.market).map(s=>s.id))
  const markers:ChartMarker[]=recentSignals.filter(s=>activeStrategyIds.has(s.strategy_id||'')).map(s=>{
    const idx=activeCandles.findIndex(c=>new Date(c.date).getTime()>=new Date(s.created_at).getTime())
    return {index:idx>=0?idx:activeCandles.length-1,type:s.action,price:s.price||0}
  })

  return <div className="shell">
    {cronStaleMinutes!=null&&cronStaleMinutes>30&&<p className="msg banner" style={{marginBottom:16}}>⚠ Background signal checks haven't run in {cronStaleMinutes} minutes (expected every ~5, though GitHub Actions' scheduler can drift 15-25 minutes under normal load — this only fires well past that). Buy/sell checks are still running normally while this page stays open, but favorited strategies may go unchecked while you're away. Check the Actions tab in the repo for a failed/disabled run, or that CRON_SECRET still matches between GitHub and Vercel.</p>}
    <section className="hero"><div><div className="eyebrow">ALWAYS-ON SIGNAL ENGINE</div><h1>Trade <span>Signals.</span></h1><p className="muted">Add every ticker you want watched. A-TAMP checks each one's favorited strategies against live prices at once and tells you exactly when to buy or sell on whatever platform you trade with — even while you're on another page.</p></div></section>

    <section className="panel">
      <div className="panel-title"><h2>WATCHLIST</h2><span className="muted">{watchlist.length} ticker{watchlist.length===1?'':'s'} watched{lastChecked?` · checked ${lastChecked}`:''}</span></div>
      <form onSubmit={addToWatchlist} className="add-holding-grid" style={{gridTemplateColumns:'2fr 1fr auto',alignItems:'end'}}>
        <label>Ticker symbol<input value={newSymbol} onChange={e=>setNewSymbol(e.target.value.toUpperCase())} placeholder="e.g. AAPL" required/></label>
        <label>Market<select value={newMarket} onChange={e=>setNewMarket(e.target.value)}>{markets.map(m=><option key={m}>{m}</option>)}</select></label>
        <button className="run cta-glow" type="submit" disabled={adding} style={{marginTop:0,width:'auto',padding:'12px 22px'}}>{adding?'ADDING…':'MAKE A-TAMP MONITOR YOUR STOCK'}</button>
      </form>
      {addError&&<p className="field-warning" style={{marginTop:10}}>⚠ {addError}</p>}
      {watchlist.length>0&&<div className="watchlist-chips">
        {watchlist.map(w=>{
          const k=key(w.symbol,w.market)
          const openCount=positions.filter(p=>favStrategies.some(f=>f.id===p.strategy_id&&f.symbol===w.symbol&&f.market===w.market)).length
          return <div className={`watchlist-chip ${k===activeKey?'active':''}`} key={w.id} onClick={()=>setActiveKey(k)}>
            <span className={`watchlist-dot ${errorByKey[k]?'err':candlesByKey[k]?'ok':''}`}/>
            <b>{w.symbol}</b><span>{w.market}</span>
            {openCount>0&&<span className="watchlist-open-badge">{openCount} open</span>}
            <span className="watchlist-remove" onClick={e=>{e.stopPropagation();removeFromWatchlist(w.id)}}>✕</span>
          </div>
        })}
      </div>}
    </section>

    {!watchlist.length?<section className="panel"><div className="empty">Add a ticker above to start watching it — A-TAMP will check every favorited strategy tested on that symbol against live prices, on this ticker and any others you add, all at once.</div></section>:<>
      <section className="panel">
        <div className="panel-title"><h2>LIVE MARKET CHART</h2><span className="muted">{active?`${active.symbol} · ${active.market}`:''}</span></div>
        <LiveChart candles={activeCandles} markers={markers} title={active?`${active.symbol}${symbolNames[active.symbol]?` · ${symbolNames[active.symbol]}`:''}`:''} windowSize={60}/>
        {active&&errorByKey[key(active.symbol,active.market)]&&(()=>{
          const msg=errorByKey[key(active.symbol,active.market)]!
          const retrying=msg.startsWith(RETRY_MSG)
          return retrying
            ? <p className="retry-banner" style={{marginTop:10}}><span className="retry-pulse-dot"/><span className="retry-text">{msg}</span></p>
            : <p className="field-warning" style={{marginTop:10}}>⚠ {msg}</p>
        })()}
      </section>

      <section className="panel">
        <div className="panel-title"><h2>WATCHING FOR {active?.symbol}</h2><span className="muted">{activeStrategyIds.size} favorited strategy{activeStrategyIds.size===1?'':'ies'}</span></div>
        {!activeStrategyIds.size?<div className="empty">No favorited strategies were tested on {active?.symbol} ({active?.market}). Star one in Research's Successful Strategy Log to start watching it here.</div>:
        <div className="table">{favStrategies.filter(s=>activeStrategyIds.has(s.id)).map(s=>{
          const pos=positions.find(p=>p.strategy_id===s.id)
          let params=s.parameters;if(typeof params==='string'){try{params=JSON.parse(params)}catch{params=null}}
          return <div className="row" key={s.id} style={{gridTemplateColumns:'2fr 1fr 1fr auto'}}>
            <div><strong>{s.name}</strong><span className="how-it-works">{params?describeFamily(s.family,params):s.family}</span></div>
            <span className={pos?'up':''}>{pos?`OPEN · bought ${fmtPrice(pos.entry_price)}`:'WATCHING FOR BUY'}</span>
            <span>{pos?`since ${fmtDateTime(pos.opened_at)}`:'—'}</span>
            {pos?<button className="ghost small-btn" disabled={closingId===pos.id} onClick={()=>closePositionManually(pos,s)}>{closingId===pos.id?'CLOSING…':'CLOSE EARLY'}</button>:<span/>}
          </div>
        })}</div>}
      </section>
    </>}
  </div>
}
