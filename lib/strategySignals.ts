import type { Candle } from './market'

// Mirrors the per-bar decision rule used by the Research backtest engine
// (app/research/page.tsx's signalFor/describeFamily) so a favorited strategy
// signals buy/sell live the same way it qualified in backtesting. Kept as a
// separate, framework-free copy so it can run both in the browser (Live
// Trading page) and server-side (the cron endpoint), rather than importing
// from the giant client-only research page component.
export function signalFor(data:Candle[], i:number, family:string, p:any):{long:boolean;sell:boolean}{
  const c=data[i].close, prev=data[i-1]?.close||c
  const fastWindow=data.slice(Math.max(0,i-p.fast),i)
  const avg=fastWindow.reduce((s,x)=>s+x.close,0)/(fastWindow.length||1)
  const slowWindow=data.slice(Math.max(0,i-p.slow),i)
  const slow=slowWindow.reduce((s,x)=>s+x.close,0)/(slowWindow.length||1)
  const rsiLike=50+((c-prev)/Math.max(prev,.01))*2500
  let long=false,short=false
  if(family==='Trend Following'){long=c>avg*(1+p.threshold);short=c<avg*(1-p.threshold)}
  if(family==='Mean Reversion'){long=rsiLike<p.rsi;short=rsiLike>100-p.rsi}
  if(family==='Breakout'){const hi=Math.max(...data.slice(Math.max(0,i-p.lookback),i).map(x=>x.close));const lo=Math.min(...data.slice(Math.max(0,i-p.lookback),i).map(x=>x.close));long=c>=hi*(1+p.threshold);short=c<=lo*(1-p.threshold)}
  if(family==='Momentum'){long=c>prev*(1+p.threshold);short=c<prev*(1-p.threshold)}
  if(family==='Volume Confirmation'){const avgv=fastWindow.reduce((s,x)=>s+x.volume,0)/(fastWindow.length||1);long=c>avg&&data[i].volume>avgv*(1+p.vol);short=c<avg}
  if(family==='RSI Regime'){long=rsiLike<p.rsi&&c>avg;short=rsiLike>100-p.rsi||c<avg*(1-p.threshold)}
  if(family==='Moving Average Cross'){long=avg>slow*(1+p.threshold);short=avg<slow*(1-p.threshold)}
  return {long,sell:short}
}

export function describeFamily(family:string, p:any):string{
  const pct=(n:number)=>`${(n*100).toFixed(2)}%`
  if(family==='Trend Following')return `Trend Following buys when price closes more than ${pct(p.threshold)} above its ${p.fast}-candle moving average, and sells once price falls more than ${pct(p.threshold)} below that same average.`
  if(family==='Mean Reversion')return `Mean Reversion buys when a short-term momentum reading drops below ${p.rsi}, and sells once it climbs back above ${100-p.rsi}.`
  if(family==='Breakout')return `Breakout buys when price closes above the highest close of the last ${p.lookback} candles by more than ${pct(p.threshold)}, and sells when price breaks back below the recent low band.`
  if(family==='Momentum')return `Momentum buys when price rises more than ${pct(p.threshold)} versus the previous candle, and sells when price falls more than ${pct(p.threshold)} versus the previous candle.`
  if(family==='Volume Confirmation')return `Volume Confirmation buys when price is above its ${p.fast}-candle average AND volume is running ${pct(p.vol)} above its ${p.fast}-candle average volume, and sells when price falls back below that average.`
  if(family==='RSI Regime')return `RSI Regime buys on a momentum pullback inside an uptrend, and sells when momentum overheats or price breaks its average by ${pct(p.threshold)}.`
  if(family==='Moving Average Cross')return `Moving Average Cross buys when the ${p.fast}-period average crosses more than ${pct(p.threshold)} above the ${p.slow}-period average, and sells when it crosses back below.`
  return 'Custom rule set.'
}

export type FavoriteStrategy = { id:string; name:string; family:string; parameters:any; symbol:string; market:string }
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
  const {data:favs}=await client.from('strategies').select('id,name,family,parameters,symbol,market')
    .eq('user_id',userId).eq('favorite',true).eq('symbol',symbol).eq('market',market)
  const favorites=(favs||[]) as FavoriteStrategy[]
  if(!favorites.length)return []

  // Buy eligibility is symbol-wide (not per-strategy): if the user already
  // holds an open position in this symbol — whichever favorited strategy
  // opened it — don't fire another buy signal for it. Sell notifications
  // still resolve to the specific strategy/position pair being closed.
  const {data:openPositions}=await client.from('live_positions').select('id,strategy_id')
    .eq('user_id',userId).eq('status','open').eq('symbol',symbol).eq('market',market)
  const openByStrategy=new Map<string,{id:string}>((openPositions||[]).map((p:any)=>[p.strategy_id,p]))
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
    } else if(openPos&&sig.sell){
      const {data:pending}=await client.from('trade_notifications').select('id')
        .eq('position_id',openPos.id).eq('action','sell').eq('acknowledged',false).limit(1)
      if(pending?.length)continue
      const {data:inserted}=await client.from('trade_notifications').insert({
        user_id:userId,strategy_id:strat.id,strategy_name:strat.name,symbol,market,action:'sell',
        price:lastClose,reason:describeFamily(strat.family,params),position_id:openPos.id
      }).select().maybeSingle()
      if(inserted)created.push(inserted as LiveNotification)
    }
  }
  return created
}
