// Shared by the corner toast (TradeSignalToast, rendered globally) and the
// Notification Center page — the same pending signal is visible in both
// places at once, polling independently, so confirming it in one had a race
// with confirming it in the other: both ran their own INSERT into
// live_positions with no check that the other had already handled it,
// producing two open positions for what was really one trade.
//
// The fix is to atomically "claim" the notification first (an UPDATE guarded
// by `.eq('acknowledged', false)`) — Postgres only lets one of two
// concurrent claims actually match a row, so whichever surface the user
// clicked second sees zero rows affected and skips creating a duplicate
// position or double-closing one.
type NotificationLike = { id:string; strategy_id?:string|null; symbol:string; market:string; price:number|null; position_id?:string|null }

export async function confirmBuySignal(client:any, userId:string, n:NotificationLike):Promise<boolean>{
  if(!n.strategy_id)return false
  const {data:claimed}=await client.from('trade_notifications').update({acknowledged:true}).eq('id',n.id).eq('acknowledged',false).select('id').maybeSingle()
  if(!claimed)return false
  const {data:pos}=await client.from('live_positions').insert({
    user_id:userId,strategy_id:n.strategy_id,symbol:n.symbol,market:n.market,entry_price:n.price||0
  }).select().maybeSingle()
  if(pos)await client.from('trade_notifications').update({position_id:pos.id}).eq('id',n.id)
  return true
}

export async function confirmSellSignal(client:any, n:NotificationLike):Promise<boolean>{
  const {data:claimed}=await client.from('trade_notifications').update({acknowledged:true}).eq('id',n.id).eq('acknowledged',false).select('id').maybeSingle()
  if(!claimed)return false
  if(n.position_id)await client.from('live_positions').update({status:'closed',exit_price:n.price||0,closed_at:new Date().toISOString()}).eq('id',n.position_id)
  return true
}

export async function dismissSignal(client:any, notificationId:string):Promise<boolean>{
  const {data:claimed}=await client.from('trade_notifications').update({acknowledged:true}).eq('id',notificationId).eq('acknowledged',false).select('id').maybeSingle()
  return !!claimed
}
