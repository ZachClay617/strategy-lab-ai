'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Notification = {
  id:string; strategy_id:string|null; strategy_name:string; symbol:string; market:string
  action:'buy'|'sell'; price:number|null; reason:string|null; position_id:string|null
  acknowledged:boolean; created_at:string
}

function fmtPrice(n:number|null){if(n==null)return '—';return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n)}
function fmtDateTime(iso:string){return new Date(iso).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'})}

export default function NotificationsPage(){
  const [session,setSession]=useState<any>(null)
  const [notifications,setNotifications]=useState<Notification[]>([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState<'all'|'pending'|'buy'|'sell'>('all')
  const [busyId,setBusyId]=useState<string|null>(null)

  useEffect(()=>{
    if(!supabase)return
    supabase.auth.getSession().then(({data})=>setSession(data.session))
    const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s))
    return ()=>data.subscription.unsubscribe()
  },[])

  useEffect(()=>{
    if(!supabase||!session?.user)return
    let dead=false
    const load=async()=>{
      const {data}=await supabase!.from('trade_notifications').select('*').eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(200)
      if(!dead){setNotifications((data||[]) as Notification[]);setLoading(false)}
    }
    load()
    const id=setInterval(load,15000)
    return ()=>{dead=true;clearInterval(id)}
  },[session?.user?.id])

  async function confirmBuy(n:Notification){
    if(!supabase||!session?.user||!n.strategy_id)return
    setBusyId(n.id)
    const {data:pos}=await supabase.from('live_positions').insert({user_id:session.user.id,strategy_id:n.strategy_id,symbol:n.symbol,market:n.market,entry_price:n.price||0}).select().maybeSingle()
    await supabase.from('trade_notifications').update({acknowledged:true,position_id:pos?.id||null}).eq('id',n.id)
    setNotifications(prev=>prev.map(x=>x.id===n.id?{...x,acknowledged:true,position_id:pos?.id||null}:x))
    setBusyId(null)
  }
  async function confirmSell(n:Notification){
    if(!supabase||!session?.user)return
    setBusyId(n.id)
    if(n.position_id)await supabase.from('live_positions').update({status:'closed',exit_price:n.price||0,closed_at:new Date().toISOString()}).eq('id',n.position_id)
    await supabase.from('trade_notifications').update({acknowledged:true}).eq('id',n.id)
    setNotifications(prev=>prev.map(x=>x.id===n.id?{...x,acknowledged:true}:x))
    setBusyId(null)
  }
  // Closes out a notification without acting on it — e.g. the user decided
  // not to take the trade, or already closed the position another way (the
  // Trade Signals page's "CLOSE EARLY" button). Just marks it acknowledged;
  // never touches live_positions, since there's nothing here to confirm.
  async function dismiss(n:Notification){
    if(!supabase||!session?.user)return
    setBusyId(n.id)
    await supabase.from('trade_notifications').update({acknowledged:true}).eq('id',n.id)
    setNotifications(prev=>prev.map(x=>x.id===n.id?{...x,acknowledged:true}:x))
    setBusyId(null)
  }

  if(!supabase)return <div className="shell"><p className="msg banner">Add Supabase environment variables first.</p></div>
  if(!session)return <div className="shell"><p className="msg banner">Log in on the <a href="/research">Research</a> page first, then come back here.</p></div>

  const filtered=notifications.filter(n=>filter==='all'?true:filter==='pending'?!n.acknowledged:n.action===filter)
  const pendingCount=notifications.filter(n=>!n.acknowledged).length

  return <div className="shell notif-page">
    <section className="hero notif-hero">
      <div>
        <div className="eyebrow notif-eyebrow"><span className="notif-pulse"/>SIGNAL FEED · LIVE</div>
        <h1>Notification <span>Center.</span></h1>
        <p className="muted">Every buy/sell signal A-TAMP has ever fired across your favorited strategies, streamed in real time.</p>
      </div>
      <div className="notif-stat"><small>PENDING ACTION</small><strong>{pendingCount}</strong></div>
    </section>

    <div className="notif-filters">
      {(['all','pending','buy','sell'] as const).map(f=><button key={f} className={filter===f?'active':''} onClick={()=>setFilter(f)}>{f.toUpperCase()}</button>)}
    </div>

    <div className="notif-feed">
      {loading?<div className="empty">Loading signal history…</div>:
       !filtered.length?<div className="empty">No {filter==='all'?'':filter+' '}signals yet. Favorite a strategy tested on a ticker in Research, then watch it on the Trade Signals page.</div>:
       filtered.map(n=><div className={`notif-card ${n.action} ${n.acknowledged?'ack':'pending'}`} key={n.id}>
        <div className="notif-card-rail"/>
        <div className="notif-card-main">
          <div className="notif-card-top">
            <span className={`notif-badge ${n.action}`}>{n.action==='buy'?'▲ BUY SIGNAL':'▼ SELL SIGNAL'}</span>
            <span className="notif-symbol">{n.symbol} · {n.market}</span>
            <span className="notif-time">{fmtDateTime(n.created_at)}</span>
          </div>
          <div className="notif-card-body">
            <b>{n.strategy_name}</b> triggered at <b>{fmtPrice(n.price)}</b>
            {n.reason&&<span className="notif-reason">{n.reason}</span>}
          </div>
        </div>
        {n.acknowledged?<span className="notif-ack-tag">✓ CONFIRMED</span>:
          <div className="notif-actions">
            <button className="notif-confirm" disabled={busyId===n.id} onClick={()=>n.action==='buy'?confirmBuy(n):confirmSell(n)}>
              {busyId===n.id?'SAVING…':n.action==='buy'?'I BOUGHT IT':'I SOLD IT'}
            </button>
            <button className="ghost small-btn notif-dismiss" disabled={busyId===n.id} onClick={()=>dismiss(n)} title="Close this out without acting on it">DISMISS</button>
          </div>}
      </div>)}
    </div>
  </div>
}
