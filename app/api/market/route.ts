import { NextRequest, NextResponse } from 'next/server'

export async function GET(req:NextRequest){
  const symbol=req.nextUrl.searchParams.get('symbol')||'AAPL'
  const days=Math.min(Number(req.nextUrl.searchParams.get('days')||3650),3650)
  const live=req.nextUrl.searchParams.get('live')==='1'
  const market=req.nextUrl.searchParams.get('market')||'Stocks'
  if(market!=='Stocks') return NextResponse.json([])
  try{
    const now=Math.floor(Date.now()/1000)
    const period1=live?now-86400:Math.floor((Date.now()-days*86400000)/1000)
    const interval=live?'1m':'1d'
    const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${now}&interval=${interval}&events=div%2Csplits&includeAdjustedClose=true`
    const r=await fetch(url,{headers:{'User-Agent':'StrategyLabAI/3.0'},cache:'no-store'})
    if(!r.ok) throw new Error('market data request failed')
    const j=await r.json();const x=j?.chart?.result?.[0];if(!x) throw new Error('no market result')
    const q=x.indicators.quote[0]
    const a=x.indicators.adjclose?.[0]?.adjclose||q.close
    const out=x.timestamp.map((t:number,i:number)=>({date:new Date(t*1000).toISOString(),open:q.open[i],high:q.high[i],low:q.low[i],close:a[i],volume:q.volume[i]})).filter((v:any)=>v.open!=null&&v.high!=null&&v.low!=null&&v.close!=null)
    return NextResponse.json(out)
  }catch(e){return NextResponse.json({error:String(e)},{status:502})}
}
