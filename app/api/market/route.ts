import { NextRequest, NextResponse } from 'next/server'

const INTERVAL_MAP:Record<string,string> = { '1m':'1m', '15m':'15m', '30m':'30m', '1h':'60m', '1d':'1d' }
const MAX_RANGE_DAYS:Record<string,number> = { '1m':7, '15m':55, '30m':55, '1h':550, '1d':3650 }

export async function GET(req:NextRequest){
  const symbol=req.nextUrl.searchParams.get('symbol')||'AAPL'
  const live=req.nextUrl.searchParams.get('live')==='1'
  const market=req.nextUrl.searchParams.get('market')||'Stocks'
  const intervalKey=req.nextUrl.searchParams.get('interval')||(live?'1m':'1d')
  const yInterval=INTERVAL_MAP[intervalKey]||'1d'
  const requestedDays=Number(req.nextUrl.searchParams.get('days')||req.nextUrl.searchParams.get('rangeDays')||3650)
  const days=Math.min(requestedDays, MAX_RANGE_DAYS[intervalKey]??3650)
  if(market!=='Stocks') return NextResponse.json([])
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
        return NextResponse.json({error:'invalid_ticker',message:description||`"${symbol}" is not a recognized ticker symbol.`},{status:404})
      }
      throw new Error('no market result')
    }
    const q=x.indicators.quote[0]
    const a=x.indicators.adjclose?.[0]?.adjclose||q.close
    const out=x.timestamp.map((t:number,i:number)=>({date:new Date(t*1000).toISOString(),open:q.open[i],high:q.high[i],low:q.low[i],close:a[i],volume:q.volume[i]})).filter((v:any)=>v.open!=null&&v.high!=null&&v.low!=null&&v.close!=null)
    return NextResponse.json(out)
  }catch(e){return NextResponse.json({error:String(e)},{status:502})}
}
