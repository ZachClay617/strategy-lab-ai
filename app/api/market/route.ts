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
  const market=req.nextUrl.searchParams.get('market')||'Stocks'
  const interval=req.nextUrl.searchParams.get('interval')||undefined
  const rangeDays=Number(req.nextUrl.searchParams.get('days')||req.nextUrl.searchParams.get('rangeDays')||3650)
  if(market!=='Stocks') return NextResponse.json([])
  const result=await fetchCandles(symbol,{live,interval,rangeDays})
  if('error' in result){
    if(result.error==='invalid_ticker')return NextResponse.json({error:'invalid_ticker',message:result.message||`"${symbol}" is not a recognized ticker symbol.`},{status:404})
    return NextResponse.json({error:result.error},{status:502})
  }
  return NextResponse.json(result.candles)
}
