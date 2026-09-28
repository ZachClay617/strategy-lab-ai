const INTERVAL_MAP:Record<string,string> = { '1m':'1m', '15m':'15m', '30m':'30m', '1h':'60m', '1d':'1d' }
const MAX_RANGE_DAYS:Record<string,number> = { '1m':7, '15m':55, '30m':55, '1h':550, '1d':3650 }

export type Candle = { date:string; open:number; high:number; low:number; close:number; volume:number }
export type MarketResult = { candles:Candle[] } | { error:string; message?:string }

// A real browser User-Agent (plus matching Accept headers) rather than a custom
// client identifier — Yahoo's undocumented chart endpoint is well known to reject
// or rate-limit requests that don't look like an actual browser, and that block
// rate is far more noticeable from a cloud/datacenter IP (e.g. Vercel's serverless
// functions) than from a residential connection, which was making live 1-minute
// polling (the most frequent caller) fail with 502s much more than occasional
// historical requests.
const BROWSER_HEADERS={
  'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':'application/json, text/plain, */*',
  'Accept-Language':'en-US,en;q=0.9',
}
async function fetchJson(url:string){
  const r=await fetch(url,{headers:BROWSER_HEADERS,cache:'no-store'})
  const j=await r.json().catch(()=>null)
  return {r,j}
}

export async function fetchCandles(symbol:string, opts:{ live?:boolean; interval?:string; rangeDays?:number }={}):Promise<MarketResult>{
  const live=!!opts.live
  const intervalKey=opts.interval||(live?'1m':'1d')
  const yInterval=INTERVAL_MAP[intervalKey]||'1d'
  const requestedDays=opts.rangeDays||3650
  const days=Math.min(requestedDays, MAX_RANGE_DAYS[intervalKey]??3650)
  const toCandles=(x:any):Candle[]|null=>{
    const timestamps=x?.timestamp
    const q=x?.indicators?.quote?.[0]
    if(!Array.isArray(timestamps)||!timestamps.length||!q)return null
    const a=x.indicators.adjclose?.[0]?.adjclose||q.close
    return timestamps.map((t:number,i:number)=>({date:new Date(t*1000).toISOString(),open:q.open[i],high:q.high[i],low:q.low[i],close:a[i],volume:q.volume[i]})).filter((v:any)=>v.open!=null&&v.high!=null&&v.low!=null&&v.close!=null)
  }
  try{
    const now=Math.floor(Date.now()/1000)
    // A weekend/holiday close (or just after-hours) can leave zero 1-minute bars
    // in a short recent window — widen it enough to always cover the last
    // trading session instead of assuming "live" means "market is open right now".
    const period1=live?now-86400*5:Math.floor((Date.now()-days*86400000)/1000)
    const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${now}&interval=${yInterval}&events=div%2Csplits&includeAdjustedClose=true`
    let {r,j}=await fetchJson(url)
    // A transient block/rate-limit (5xx, or no body at all) is worth one quick
    // retry before giving up — a real ticker shouldn't be reported "invalid" or
    // "unavailable" over what's often a one-off upstream hiccup.
    if((!r.ok&&r.status>=500)||!j){
      await new Promise(res=>setTimeout(res,400))
      ;({r,j}=await fetchJson(url))
    }
    const x=j?.chart?.result?.[0]
    if(!x){
      const description=j?.chart?.error?.description
      if(!r.ok || j?.chart?.error){
        return {error:'invalid_ticker',message:description||`"${symbol}" is not a recognized ticker symbol.`}
      }
      throw new Error('no market result')
    }
    const candles=toCandles(x)
    if(candles)return {candles}
    // The result came back with no usable bars at all (e.g. a fresh/illiquid
    // symbol, or an interval Yahoo just doesn't have data for over this span).
    // Fall back to a coarser, much wider daily window so the caller still gets
    // the most recent real candles instead of a crash or a stuck empty chart.
    if(live){
      const fbUrl=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${now-86400*10}&period2=${now}&interval=1d&events=div%2Csplits&includeAdjustedClose=true`
      const {j:fj}=await fetchJson(fbUrl)
      const fallback=toCandles(fj?.chart?.result?.[0])
      if(fallback)return {candles:fallback}
    }
    return {candles:[]}
  }catch(e){return {error:String(e)}}
}

export async function fetchSymbolName(symbol:string):Promise<string|null>{
  try{
    const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`
    const {j}=await fetchJson(url)
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
