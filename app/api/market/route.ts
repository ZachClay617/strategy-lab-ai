import { NextRequest, NextResponse } from 'next/server'
import { fetchCandles, fetchSymbolNames } from '@/lib/market'
import { checkRateLimit, clientIp, rateLimitedPayload } from '@/lib/rateLimit'
import { getRequestUserId } from '@/lib/serverAuth'

// Read-only proxy to the market-data provider. Every caller in the app is a
// logged-in page, so this now requires a session: left open, one script could
// loop ?names= with 30 tickers and drive thousands of upstream requests a
// minute through this deployment's shared egress, which the provider answers
// by throttling the whole deployment — taking Research, Trade Signals, Home
// and Portfolios down for every real user at once.
export async function GET(req:NextRequest){
  // Rate limit runs first so an unauthenticated flood is cheap to reject —
  // it never reaches the session check's round-trip to Supabase.
  const rl=await checkRateLimit('market',clientIp(req),[
    {limit:120,windowMs:60_000,label:'burst'},
    {limit:2000,windowMs:3_600_000,label:'hourly'},
  ])
  if(!rl.ok){
    const p=rateLimitedPayload(rl)
    return NextResponse.json(p.body,{status:p.status,headers:p.headers})
  }
  const userId=await getRequestUserId(req)
  if(!userId)return NextResponse.json({error:'unauthorized',message:'Sign in to load market data.'},{status:401})
  // A second, per-account tier: the per-IP tier above is the only thing
  // standing between one signed-in user and the whole deployment's upstream
  // quota, and IPs are cheap to rotate while accounts are comparatively not.
  const userRl=await checkRateLimit('market-user',userId,[
    {limit:240,windowMs:60_000,label:'burst'},
    {limit:4000,windowMs:3_600_000,label:'hourly'},
  ])
  if(!userRl.ok){
    const p=rateLimitedPayload(userRl)
    return NextResponse.json(p.body,{status:p.status,headers:p.headers})
  }

  // Ticker format guard: bounds the upstream fan-out and rejects junk input
  // before it ever reaches the market-data provider.
  const VALID_SYMBOL=/^[A-Z0-9.^=-]{1,15}$/i
  const namesParam=req.nextUrl.searchParams.get('names')
  if(namesParam){
    // One request here becomes one upstream request per symbol, so the cap is
    // what actually bounds the fan-out. 30 was generous; no call site asks for
    // more than a portfolio's worth at a time, and the page batches anyway.
    const symbols=namesParam.split(',').map(s=>s.trim()).filter(s=>VALID_SYMBOL.test(s)).slice(0,20)
    const names=await fetchSymbolNames(symbols)
    return NextResponse.json(names)
  }
  const symbol=req.nextUrl.searchParams.get('symbol')||'AAPL'
  if(!VALID_SYMBOL.test(symbol))return NextResponse.json({error:'invalid_ticker',message:'That is not a valid ticker symbol.'},{status:400})
  const live=req.nextUrl.searchParams.get('live')==='1'
  const interval=req.nextUrl.searchParams.get('interval')||undefined
  const rangeDays=Number(req.nextUrl.searchParams.get('days')||req.nextUrl.searchParams.get('rangeDays')||3650)
  // Yahoo's chart endpoint serves crypto (e.g. BTC-USD) through the exact same
  // API as stocks, so no separate code path is needed — the "market" param is
  // kept for the caller's own labeling but no longer gates what data loads.
  const result=await fetchCandles(symbol,{live,interval,rangeDays})
  if('error' in result){
    if(result.error==='invalid_ticker')return NextResponse.json({error:'invalid_ticker',message:result.message||`"${symbol}" is not a recognized ticker symbol.`},{status:404})
    // The upstream failure's own text can carry internals (hostnames, cause
    // chains); it is logged server-side and the caller gets a fixed code.
    console.error('market upstream failure',result.error)
    return NextResponse.json({error:'upstream_unavailable',message:'Market data is temporarily unavailable. Please try again shortly.'},{status:502})
  }
  return NextResponse.json(result.candles)
}
