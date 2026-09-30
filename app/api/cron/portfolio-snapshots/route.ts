import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { fetchLastPrice } from '@/lib/market'
import { checkRateLimit, clientIp, rateLimitedPayload } from '@/lib/rateLimit'

// Called every ~15 minutes by an external scheduler (not Vercel Cron, which can't
// run sub-daily on the Hobby plan) so the portfolio return chart keeps gaining
// data points even when nobody has the site open. Auth is a shared secret, since
// this writes data for every user and must not be triggerable by the public.
export const dynamic = 'force-dynamic'

type Holding = { id:string; portfolio_id:string; symbol:string; weight:number; entry_price:number|null; shares:number|null }
type ClosedTrade = { portfolio_id:string; shares:number; entry_price:number; realized_pl:number }

// Header-only on purpose: a secret in a query string gets recorded in host,
// proxy, and analytics logs; an Authorization header does not. Compared in
// constant time so response timing can't leak how much of a guess matched.
function isAuthorized(req:NextRequest){
  const secret=process.env.CRON_SECRET
  if(!secret)return false
  const provided=req.headers.get('authorization')||''
  const expected=`Bearer ${secret}`
  const a=Buffer.from(provided),b=Buffer.from(expected)
  return a.length===b.length&&timingSafeEqual(a,b)
}

export async function GET(req:NextRequest){
  // Ahead of the secret check on purpose — also throttles repeated wrong-secret
  // guesses from the same IP, not just legitimate-but-excessive calls.
  const rl=await checkRateLimit('cron-portfolio-snapshots',clientIp(req),[{limit:30,windowMs:3_600_000,label:'hourly'}])
  if(!rl.ok){
    const p=rateLimitedPayload(rl)
    return NextResponse.json(p.body,{status:p.status,headers:p.headers})
  }
  if(!isAuthorized(req))return NextResponse.json({error:'unauthorized'},{status:401})

  const url=process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!url||!serviceKey)return NextResponse.json({error:'Supabase service role key is not configured'},{status:500})
  const admin=createClient(url,serviceKey)

  const {data:portfolios,error:pErr}=await admin.from('portfolios').select('id,user_id')
  if(pErr)return NextResponse.json({error:pErr.message},{status:500})
  if(!portfolios?.length)return NextResponse.json({snapshotsWritten:0,portfoliosSkipped:0,symbolsFetched:0})

  const {data:holdings,error:hErr}=await admin.from('portfolio_holdings').select('id,portfolio_id,symbol,weight,entry_price,shares')
  if(hErr)return NextResponse.json({error:hErr.message},{status:500})

  const {data:closedTrades,error:cErr}=await admin.from('portfolio_realized_trades').select('portfolio_id,shares,entry_price,realized_pl')
  if(cErr)return NextResponse.json({error:cErr.message},{status:500})

  const bySymbol=new Map<string,number|null>()
  for(const h of (holdings||[]) as Holding[])if(!bySymbol.has(h.symbol))bySymbol.set(h.symbol,null)
  await Promise.all(Array.from(bySymbol.keys()).map(async sym=>{
    const price=(await fetchLastPrice(sym,true)) ?? (await fetchLastPrice(sym,false))
    bySymbol.set(sym,price)
  }))

  const holdingsByPortfolio=new Map<string,Holding[]>()
  for(const h of (holdings||[]) as Holding[]){
    const list=holdingsByPortfolio.get(h.portfolio_id)||[]
    list.push(h);holdingsByPortfolio.set(h.portfolio_id,list)
  }
  const closedByPortfolio=new Map<string,ClosedTrade[]>()
  for(const c of (closedTrades||[]) as ClosedTrade[]){
    const list=closedByPortfolio.get(c.portfolio_id)||[]
    list.push(c);closedByPortfolio.set(c.portfolio_id,list)
  }

  // All-time return: unrealized gain/loss on open holdings plus realized
  // gain/loss already locked in from past (sold) trades, as a share of
  // everything ever invested — mirrors the frontend's all-time calculation
  // so closing a position doesn't erase its contribution to performance.
  const rows:{portfolio_id:string;user_id:string;return_pct:number}[]=[]
  for(const p of portfolios){
    const list=holdingsByPortfolio.get(p.id)||[]
    const closed=closedByPortfolio.get(p.id)||[]
    if(!list.length&&!closed.length)continue
    let gainDollar=0,costBasis=0
    for(const h of list){
      const price=bySymbol.get(h.symbol);if(price==null||!h.entry_price)continue
      const sh=h.shares!=null?h.shares:1
      costBasis+=h.entry_price*sh
      gainDollar+=(price-h.entry_price)*sh
    }
    for(const c of closed){costBasis+=c.entry_price*c.shares;gainDollar+=c.realized_pl}
    if(!(costBasis>0))continue
    rows.push({portfolio_id:p.id,user_id:p.user_id,return_pct:gainDollar/costBasis*100})
  }

  if(rows.length){
    const {error:insertError}=await admin.from('portfolio_snapshots').insert(rows)
    if(insertError)return NextResponse.json({error:insertError.message},{status:500})
  }

  return NextResponse.json({snapshotsWritten:rows.length,portfoliosSkipped:portfolios.length-rows.length,symbolsFetched:bySymbol.size})
}
