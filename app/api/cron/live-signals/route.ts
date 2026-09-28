import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchCandles } from '@/lib/market'
import { evaluateSymbolSignals } from '@/lib/strategySignals'
import { checkRateLimit, clientIp, rateLimitedPayload } from '@/lib/rateLimit'

// Called periodically by an external scheduler (same pattern as
// /api/cron/portfolio-snapshots) so favorited strategies keep being checked
// against live prices even when nobody has the Trade Signals page open, the
// site is reloaded, or the user isn't logged in. Auth is a shared secret since
// this reads/writes data for every user via the service role key.
export const dynamic = 'force-dynamic'

function isAuthorized(req:NextRequest){
  const secret=process.env.CRON_SECRET
  if(!secret)return false
  const header=req.headers.get('authorization')
  if(header===`Bearer ${secret}`)return true
  return req.nextUrl.searchParams.get('secret')===secret
}

export async function GET(req:NextRequest){
  // Ahead of the secret check on purpose — also throttles repeated wrong-secret
  // guesses from the same IP, not just legitimate-but-excessive calls.
  const rl=await checkRateLimit('cron-live-signals',clientIp(req),[{limit:30,windowMs:3_600_000,label:'hourly'}])
  if(!rl.ok){
    const p=rateLimitedPayload(rl)
    return NextResponse.json(p.body,{status:p.status,headers:p.headers})
  }
  if(!isAuthorized(req))return NextResponse.json({error:'unauthorized'},{status:401})

  const url=process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!url||!serviceKey)return NextResponse.json({error:'Supabase service role key is not configured'},{status:500})
  const admin=createClient(url,serviceKey)
  // Stamped as soon as the endpoint is confirmed reachable/authorized (not
  // gated on there being any favorites to check) — the Trade Signals page
  // reads this to warn if the scheduled GitHub Actions job has gone stale
  // (auto-disabled after 60 days of repo inactivity, a rotated CRON_SECRET
  // mismatch, etc). Never let a heartbeat-write hiccup fail the actual job.
  // Awaited (not fire-and-forget) — a serverless function can be frozen the
  // instant it returns its response, which would drop an unawaited write.
  const {error:heartbeatErr}=await admin.from('cron_heartbeats').upsert({name:'live-signals',last_run_at:new Date().toISOString()})
  if(heartbeatErr)console.error('cron heartbeat write failed',heartbeatErr)

  const {data:favorites,error:favErr}=await admin.from('strategies').select('id,user_id,symbol,market').eq('favorite',true)
  if(favErr)return NextResponse.json({error:favErr.message},{status:500})
  if(!favorites?.length)return NextResponse.json({checked:0,notificationsCreated:0})

  const candlesBySymbol=new Map<string,Awaited<ReturnType<typeof fetchCandles>>>()
  const symbolKeys=Array.from(new Set(favorites.map(f=>f.symbol)))
  await Promise.all(symbolKeys.map(async sym=>{
    candlesBySymbol.set(sym, await fetchCandles(sym,{live:true}))
  }))

  const userSymbolPairs=new Map<string,{userId:string;symbol:string;market:string}>()
  for(const f of favorites){
    const key=`${f.user_id}::${f.symbol}::${f.market}`
    if(!userSymbolPairs.has(key))userSymbolPairs.set(key,{userId:f.user_id,symbol:f.symbol,market:f.market})
  }

  let notificationsCreated=0
  for(const {userId,symbol,market} of userSymbolPairs.values()){
    const result=candlesBySymbol.get(symbol)
    if(!result||'error' in result)continue
    const created=await evaluateSymbolSignals(admin,userId,symbol,market,result.candles)
    notificationsCreated+=created.length
  }

  return NextResponse.json({checked:userSymbolPairs.size,notificationsCreated})
}
