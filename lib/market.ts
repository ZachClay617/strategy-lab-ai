const INTERVAL_MAP:Record<string,string> = { '1m':'1m', '15m':'15m', '30m':'30m', '1h':'60m', '1d':'1d' }
const MAX_RANGE_DAYS:Record<string,number> = { '1m':7, '15m':55, '30m':55, '1h':550, '1d':3650 }

export type Candle = { date:string; open:number; high:number; low:number; close:number; volume:number }
export type MarketResult = { candles:Candle[] } | { error:string; message?:string }

export async function fetchCandles(symbol:string, opts:{ live?:boolean; interval?:string; rangeDays?:number }={}):Promise<MarketResult>{
  const live=!!opts.live
  const intervalKey=opts.interval||(live?'1m':'1d')
  const yInterval=INTERVAL_MAP[intervalKey]||'1d'
  const requestedDays=opts.rangeDays||3650
  const days=Math.min(requestedDays, MAX_RANGE_DAYS[intervalKey]??3650)
  try{
    const now=Math.floor(Date.now()/1000)
    const period1=live?now-86400*2:Math.floor((Date.now()-days*86400000)/1000)
    const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${now}&interval=${yInterval}&events=div%2Csplits&includeAdjustedClose=true`
    const r=await fetch(url,{headers:{'User-Agent':'StrategyLabAI/3.0'},cache:'no-store'})
    const j=await r.json().catch(()=>null)
    const x=j?.chart?.result?.[0]
    if(!x){
      const description=j?.chart?.error?.description
      if(!r.ok || j?.chart?.error){
        return {error:'invalid_ticker',message:description||`"${symbol}" is not a recognized ticker symbol.`}
      }
      throw new Error('no market result')
    }
    const q=x.indicators.quote[0]
    const a=x.indicators.adjclose?.[0]?.adjclose||q.close
    const candles=x.timestamp.map((t:number,i:number)=>({date:new Date(t*1000).toISOString(),open:q.open[i],high:q.high[i],low:q.low[i],close:a[i],volume:q.volume[i]})).filter((v:any)=>v.open!=null&&v.high!=null&&v.low!=null&&v.close!=null)
    return {candles}
  }catch(e){return {error:String(e)}}
}

export async function fetchSymbolName(symbol:string):Promise<string|null>{
  try{
    const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`
    const r=await fetch(url,{headers:{'User-Agent':'StrategyLabAI/3.0'},cache:'no-store'})
    const j=await r.json().catch(()=>null)
    const meta=j?.chart?.result?.[0]?.meta
    return meta?.longName||meta?.shortName||null
  }catch{return null}
}

export async function fetchSymbolNames(symbols:string[]):Promise<Record<string,string>>{
  if(!symbols.length)return {}
  const out:Record<string,string>={}
  await Promise.all(symbols.map(async sym=>{
    const name=await fetchSymbolName(sym)
    if(name)out[sym]=name
  }))
  return out
}

export async function fetchLastPrice(symbol:string, live:boolean=true):Promise<number|null>{
  const result=live
    ? await fetchCandles(symbol,{live:true})
    : await fetchCandles(symbol,{interval:'1d',rangeDays:10})
  if('candles' in result && result.candles.length)return result.candles[result.candles.length-1].close
  return null
}
