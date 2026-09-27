'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { evaluateSymbolSignals, describeFamily } from '@/lib/strategySignals'
import LiveChart, { ChartMarker } from '@/app/components/LiveChart'
import type { Candle } from '@/lib/market'

type FavStrategy = { id:string; name:string; family:string; parameters:any; symbol:string; market:string }
type Position = { id:string; strategy_id:string; entry_price:number; opened_at:string; status:string }
type NotifRow = { id:string; strategy_id:string|null; action:'buy'|'sell'; price:number|null; created_at:string }

const markets=['Stocks','Crypto']

function fmtPrice(n:number){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n)}
function fmtDateTime(iso?:string){if(!iso)return '—';return new Date(iso).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}

export default function LiveTradingPage(){
  const [session,setSession]=useState<any>(null)
  const [symbol,setSymbol]=useState('AAPL')
  const [market,setMarket]=useState('Stocks')
  const [candles,setCandles]=useState<Candle[]>([])
  const [tickerError,setTickerError]=useState<string|null>(null)
  const [favStrategies,setFavStrategies]=useState<FavStrategy[]>([])
  const [positions,setPositions]=useState<Position[]>([])
  const [recentSignals,setRecentSignals]=useState<NotifRow[]>([])
  const [status,setStatus]=useState('Connecting to live market data…')

  useEffect(()=>{
    if(!supabase)return
    supabase.auth.getSession().then(({data})=>setSession(data.session))
    const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s))
    return ()=>data.subscription.unsubscribe()
  },[])

  useEffect(()=>{
    const saved=localStorage.getItem('tradeSignalsSymbol')
    const savedMarket=localStorage.getItem('tradeSignalsMarket')
    if(saved)setSymbol(saved)
    if(savedMarket)setMarket(savedMarket)
  },[])
  useEffect(()=>{localStorage.setItem('tradeSignalsSymbol',symbol);localStorage.setItem('tradeSignalsMarket',market)},[symbol,market])

  // Poll live candles for the selected ticker.
  useEffect(()=>{
    let dead=false
    const load=async()=>{
      try{
        const r=await fetch(`/api/market?symbol=${encodeURIComponent(symbol)}&live=1`)
        const j=await r.json()
        if(dead)return
        if(Array.isArray(j)&&j.length){setCandles(j);setTickerError(null);setStatus(`Updated ${new Date().toLocaleTimeString()}`)}
        else if(j?.error==='invalid_ticker'){setCandles([]);setTickerError(j.message||`"${symbol}" is not a recognized ticker symbol.`)}
        else setStatus('Live feed unavailable')
      }catch{if(!dead)setStatus('Live feed unavailable')}
    }
    load()
    const id=setInterval(load,15000)
    return ()=>{dead=true;clearInterval(id)}
  },[symbol])

  // Load favorited strategies watching this exact symbol+market.
  useEffect(()=>{
    if(!supabase||!session?.user)return
    let dead=false
    const load=async()=>{
      const {data}=await supabase!.from('strategies').select('id,name,family,parameters,symbol,market')
        .eq('user_id',session.user.id).eq('favorite',true).eq('symbol',symbol).eq('market',market)
      if(!dead)setFavStrategies((data||[]) as FavStrategy[])
    }
    load()
    const id=setInterval(load,20000)
    return ()=>{dead=true;clearInterval(id)}
  },[session?.user?.id,symbol,market])

  // Load open positions + recent signals for those strategies.
  useEffect(()=>{
    if(!supabase||!session?.user||!favStrategies.length){setPositions([]);setRecentSignals([]);return}
    let dead=false
    const ids=favStrategies.map(f=>f.id)
    const load=async()=>{
      const [{data:pos},{data:sig}]=await Promise.all([
        supabase!.from('live_positions').select('id,strategy_id,entry_price,opened_at,status').in('strategy_id',ids).eq('status','open'),
        supabase!.from('trade_notifications').select('id,strategy_id,action,price,created_at').in('strategy_id',ids).order('created_at',{ascending:false}).limit(10)
      ])
      if(dead)return
      setPositions((pos||[]) as Position[]);setRecentSignals((sig||[]) as NotifRow[])
    }
    load()
    const id=setInterval(load,15000)
    return ()=>{dead=true;clearInterval(id)}
  },[session?.user?.id,favStrategies])

  // Actively check for a new signal while this page is open, in addition to
  // the always-on server cron that covers every favorited symbol regardless
  // of what page (or whether) the user has open.
  useEffect(()=>{
    if(!supabase||!session?.user||!candles.length||!favStrategies.length)return
    const check=async()=>{
      await evaluateSymbolSignals(supabase!,session.user.id,symbol,market,candles)
    }
    check()
    const id=setInterval(check,20000)
    return ()=>clearInterval(id)
  },[session?.user?.id,symbol,market,candles.length,favStrategies.length])

  if(!supabase)return <div className="shell"><p className="msg banner">Add Supabase environment variables first.</p></div>
  if(!session)return <div className="shell"><p className="msg banner">Log in on the <a href="/research">Research</a> page first, then come back here.</p></div>

  const markers:ChartMarker[]=recentSignals.map(s=>{
    const idx=candles.findIndex(c=>new Date(c.date).getTime()>=new Date(s.created_at).getTime())
    return {index:idx>=0?idx:candles.length-1,type:s.action,price:s.price||0}
  })

  return <div className="shell">
    <section className="hero"><div><div className="eyebrow">ALWAYS-ON SIGNAL ENGINE</div><h1>Trade <span>Signals.</span></h1><p className="muted">Pick a ticker. A-TAMP watches every favorited strategy tested on it and tells you exactly when to buy or sell on whatever platform you trade with — even while you're on another page.</p></div></section>

    <section className="panel">
      <div className="add-holding-grid" style={{gridTemplateColumns:'2fr 1fr'}}>
        <label>Ticker symbol<input value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())} placeholder="e.g. AAPL"/></label>
        <label>Market<select value={market} onChange={e=>setMarket(e.target.value)}>{markets.map(m=><option key={m}>{m}</option>)}</select></label>
      </div>
    </section>

    <section className="panel">
      <div className="panel-title"><h2>LIVE MARKET CHART</h2><span className="muted">{status}</span></div>
      <LiveChart candles={candles} markers={markers} title={symbol} windowSize={60}/>
      {tickerError&&<p className="field-warning" style={{marginTop:10}}>⚠ {tickerError}</p>}
    </section>

    <section className="panel">
      <div className="panel-title"><h2>WATCHING FOR {symbol}</h2><span className="muted">{favStrategies.length} favorited strategy{favStrategies.length===1?'':'ies'}</span></div>
      {!favStrategies.length?<div className="empty">No favorited strategies were tested on {symbol} ({market}). Star one in Research's Successful Strategy Log to start watching it here.</div>:
      <div className="table">{favStrategies.map(s=>{
        const pos=positions.find(p=>p.strategy_id===s.id)
        let params=s.parameters;if(typeof params==='string'){try{params=JSON.parse(params)}catch{params=null}}
        return <div className="row" key={s.id} style={{gridTemplateColumns:'2fr 1fr 1fr'}}>
          <div><strong>{s.name}</strong><span className="how-it-works">{params?describeFamily(s.family,params):s.family}</span></div>
          <span className={pos?'up':''}>{pos?`OPEN · bought ${fmtPrice(pos.entry_price)}`:'WATCHING FOR BUY'}</span>
          <span>{pos?`since ${fmtDateTime(pos.opened_at)}`:'—'}</span>
        </div>
      })}</div>}
    </section>
  </div>
}
