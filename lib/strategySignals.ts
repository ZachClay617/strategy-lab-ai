import type { Candle } from './market'
import { computeIndicatorContext, signalForFamily, describeFamily as engineDescribeFamily, clampParamsToSession, maxHoldMsFor, sessionHoldExpired, TierKey } from '@/app/research/engine'

// Delegates to the exact same indicator math and per-bar decision rule as the
// Research backtest engine (app/research/engine.ts's computeIndicatorContext/
// signalForFamily) so a favorited strategy signals buy/sell live the same way
// it qualified in backtesting, across all families the engine supports —
// this used to be a separate hand-rolled copy that only implemented 7 of the
// 12 families and used a crude 1-bar "RSI" proxy instead of real Wilder RSI,
// so MACD/Bollinger/Donchian/VWAP/ATR favorites never signaled live and
// Mean Reversion/RSI Regime favorites signaled on the wrong indicator.
// Params are clamped to the available candle history the same way research
// clamps them to each backtest session's length, so a strategy saved with
// parameters sized for a longer session still evaluates sanely against
// whatever live history is on hand.
export function signalFor(data:Candle[], i:number, family:string, p:any):{long:boolean;sell:boolean}{
  const clamped=clampParamsToSession(p,data.length)
  const ctx=computeIndicatorContext(data,clamped)
  return signalForFamily(ctx,data,i,family,clamped)
}

export function describeFamily(family:string, p:any):string{
  return engineDescribeFamily(family,p)
}

export type FavoriteStrategy = { id:string; name:string; family:string; parameters:any; symbol:string; market:string; sessions?:{tier?:string}[]|null }
export type LiveNotification = {
  id:string; user_id:string; strategy_id:string|null; strategy_name:string; symbol:string; market:string
  action:'buy'|'sell'; price:number|null; reason:string|null; position_id:string|null; acknowledged:boolean; created_at:string
}

// Evaluates every favorited strategy the user has for this exact symbol+market
// against the latest candle, and writes a trade_notifications row (with a
// duplicate-notification guard) whenever one fires. Works identically whether
// `client` is the browser's RLS-scoped Supabase client (Trade Signals page,
// while open) or a service-role admin client (the always-on cron job) — the
// server cron is what makes detection keep running while the site is on
// another page, reloaded, or the user is logged out.
export async function evaluateSymbolSignals(client:any, userId:string, symbol:string, market:string, candles:Candle[]):Promise<LiveNotification[]>{
  if(candles.length<2)return []
  const {data:favs}=await client.from('strategies').select('id,name,family,parameters,symbol,market,sessions')
    .eq('user_id',userId).eq('favorite',true).eq('symbol',symbol).eq('market',market)
  const favorites=(favs||[]) as FavoriteStrategy[]
  if(!favorites.length)return []

  // Buy eligibility is symbol-wide (not per-strategy): if the user already
  // holds an open position in this symbol — whichever favorited strategy
  // opened it — don't fire another buy signal for it. Sell notifications
  // still resolve to the specific strategy/position pair being closed.
  const {data:openPositions}=await client.from('live_positions').select('id,strategy_id,opened_at')
    .eq('user_id',userId).eq('status','open').eq('symbol',symbol).eq('market',market)
  const openByStrategy=new Map<string,{id:string;opened_at:string}>((openPositions||[]).map((p:any)=>[p.strategy_id,p]))
  const hasOpenPositionForSymbol=(openPositions||[]).length>0

  const i=candles.length-1
  const lastClose=candles[i].close
  const created:LiveNotification[]=[]

  for(const strat of favorites){
    let params=strat.parameters
    if(typeof params==='string'){try{params=JSON.parse(params)}catch{continue}}
    if(!params)continue
    const sig=signalFor(candles,i,strat.family,params)
    const openPos=openByStrategy.get(strat.id)

    if(!hasOpenPositionForSymbol&&sig.long){
      const {data:pending}=await client.from('trade_notifications').select('id')
        .eq('user_id',userId).eq('strategy_id',strat.id).eq('action','buy').eq('acknowledged',false).limit(1)
      if(pending?.length)continue
      const {data:inserted}=await client.from('trade_notifications').insert({
        user_id:userId,strategy_id:strat.id,strategy_name:strat.name,symbol,market,action:'buy',
        price:lastClose,reason:describeFamily(strat.family,params)
      }).select().maybeSingle()
      if(inserted)created.push(inserted as LiveNotification)
    } else if(openPos){
      // Mirrors backtestSession's force-close rule: a strategy is validated with a
      // max-hold-time cap for its bar size (3 days hourly, 5 days daily, same-session
      // for 15-minute), so a live position left open past that isn't something the
      // backtest that qualified it would ever have let ride — it should close the
      // same way, on a "sell signal OR held too long" basis, not sell-signal-only.
      const tier=strat.sessions?.[0]?.tier as TierKey|undefined
      const maxHoldMs=tier?maxHoldMsFor(tier):undefined
      const heldTooLong=tier==='15m'
        ? sessionHoldExpired(openPos.opened_at,new Date().toISOString())
        : maxHoldMs!=null && Date.now()-new Date(openPos.opened_at).getTime()>=maxHoldMs
      if(sig.sell||heldTooLong){
        const {data:pending}=await client.from('trade_notifications').select('id')
          .eq('position_id',openPos.id).eq('action','sell').eq('acknowledged',false).limit(1)
        if(pending?.length)continue
        const {data:inserted}=await client.from('trade_notifications').insert({
          user_id:userId,strategy_id:strat.id,strategy_name:strat.name,symbol,market,action:'sell',
          price:lastClose,reason:heldTooLong&&!sig.sell?`Maximum hold time reached for this strategy's bar size (${describeFamily(strat.family,params)})`:describeFamily(strat.family,params),position_id:openPos.id
        }).select().maybeSingle()
        if(inserted)created.push(inserted as LiveNotification)
      }
    }
  }
  return created
}
