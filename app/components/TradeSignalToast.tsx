'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type Notification = {
  id:string; strategy_id:string|null; strategy_name:string; symbol:string; market:string
  action:'buy'|'sell'; price:number|null; reason:string|null; position_id:string|null; created_at:string
}

function fmtPrice(n:number|null){if(n==null)return '—';return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n)}

// Rendered once in the root layout so a pending buy/sell signal shows up as a
// small, persistent toast no matter which page the user is on — it keeps
// polling in the background rather than living inside the Live Trading page.
export default function TradeSignalToast(){
  const [userId,setUserId]=useState<string|null>(null)
  const [pending,setPending]=useState<Notification[]>([])
  const [busyId,setBusyId]=useState<string|null>(null)

  useEffect(()=>{
    if(!supabase)return
    supabase.auth.getSession().then(({data})=>setUserId(data.session?.user?.id||null))
    const {data}=supabase.auth.onAuthStateChange((_e,s)=>setUserId(s?.user?.id||null))
    return ()=>data.subscription.unsubscribe()
  },[])

  useEffect(()=>{
    if(!supabase||!userId){setPending([]);return}
    let dead=false
    const load=async()=>{
      const {data}=await supabase!.from('trade_notifications').select('id,strategy_id,strategy_name,symbol,market,action,price,reason,position_id,created_at')
        .eq('user_id',userId).eq('acknowledged',false).order('created_at',{ascending:true}).limit(5)
      if(!dead)setPending((data||[]) as Notification[])
    }
    load()
    const id=setInterval(load,12000)
    return ()=>{dead=true;clearInterval(id)}
  },[userId])

  async function confirmBuy(n:Notification){
    if(!supabase||!userId||!n.strategy_id)return
    setBusyId(n.id)
    const {data:pos}=await supabase.from('live_positions').insert({
      user_id:userId,strategy_id:n.strategy_id,symbol:n.symbol,market:n.market,entry_price:n.price||0
    }).select().maybeSingle()
    await supabase.from('trade_notifications').update({acknowledged:true,position_id:pos?.id||null}).eq('id',n.id)
    setPending(prev=>prev.filter(p=>p.id!==n.id))
    setBusyId(null)
  }

  async function confirmSell(n:Notification){
    if(!supabase||!userId)return
    setBusyId(n.id)
    if(n.position_id)await supabase.from('live_positions').update({status:'closed',exit_price:n.price||0,closed_at:new Date().toISOString()}).eq('id',n.position_id)
    await supabase.from('trade_notifications').update({acknowledged:true}).eq('id',n.id)
    setPending(prev=>prev.filter(p=>p.id!==n.id))
    setBusyId(null)
  }

  if(!pending.length)return null
  const shown=pending.slice(0,3)
  const extra=pending.length-shown.length

  return <div className="signal-toast-stack">
    {shown.map(n=><div className={`signal-toast ${n.action}`} key={n.id}>
      <div className="signal-toast-head">
        <span className="signal-toast-badge">{n.action==='buy'?'▲ BUY':'▼ SELL'}</span>
        <span className="signal-toast-symbol">{n.symbol}</span>
      </div>
      <div className="signal-toast-body">
        <b>{n.strategy_name}</b> signals {n.action} at <b>{fmtPrice(n.price)}</b>
      </div>
      <button className="signal-toast-confirm" disabled={busyId===n.id} onClick={()=>n.action==='buy'?confirmBuy(n):confirmSell(n)}>
        {busyId===n.id?'SAVING…':n.action==='buy'?'✓ I BOUGHT IT':'✓ I SOLD IT'}
      </button>
    </div>)}
    {extra>0&&<Link href="/notifications" className="signal-toast-more">+{extra} more signal{extra>1?'s':''} → </Link>}
  </div>
}
