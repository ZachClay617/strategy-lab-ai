import { NextRequest, NextResponse } from 'next/server'
import { fetchCandles, fetchSymbolNames } from '@/lib/market'

export async function GET(req:NextRequest){
  const namesParam=req.nextUrl.searchParams.get('names')
  if(namesParam){
    const symbols=namesParam.split(',').map(s=>s.trim()).filter(Boolean)
    const names=await fetchSymbolNames(symbols)
    return NextResponse.json(names)
  }
  const symbol=req.nextUrl.searchParams.get('symbol')||'AAPL'
  const live=req.nextUrl.searchParams.get('live')==='1'
  const interval=req.nextUrl.searchParams.get('interval')||undefined
  const rangeDays=Number(req.nextUrl.searchParams.get('days')||req.nextUrl.searchParams.get('rangeDays')||3650)
  // Yahoo's chart endpoint serves crypto (e.g. BTC-USD) through the exact same
  // API as stocks, so no separate code path is needed — the "market" param is
  // kept for the caller's own labeling but no longer gates what data loads.
  const result=await fetchCandles(symbol,{live,interval,rangeDays})
  if('error' in result){
    if(result.error==='invalid_ticker')return NextResponse.json({error:'invalid_ticker',message:result.message||`"${symbol}" is not a recognized ticker symbol.`},{status:404})
    return NextResponse.json({error:result.error},{status:502})
  }
  return NextResponse.json(result.candles)
}
