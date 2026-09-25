import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchLastPrice } from '@/lib/market'

// Called every ~15 minutes by an external scheduler (not Vercel Cron, which can't
// run sub-daily on the Hobby plan) so the portfolio return chart keeps gaining
// data points even when nobody has the site open. Auth is a shared secret, since
// this writes data for every user and must not be triggerable by the public.
export const dynamic = 'force-dynamic'

type Holding = { id:string; portfolio_id:string; symbol:string; weight:number; entry_price:number|null; shares:number|null }

function isAuthorized(req:NextRequest){
  const secret=process.env.CRON_SECRET
  if(!secret)return false
  const header=req.headers.get('authorization')
  if(header===`Bearer ${secret}`)return true
  const queryToken=req.nextUrl.searchParams.get('secret')
  return queryToken===secret
}

export async function GET(req:NextRequest){
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

  const rows:{portfolio_id:string;user_id:string;return_pct:number}[]=[]
  for(const p of portfolios){
    const list=holdingsByPortfolio.get(p.id)||[]
    if(!list.length)continue
    const holdingValue=(h:Holding)=>{const price=bySymbol.get(h.symbol);return h.shares!=null&&price!=null?h.shares*price:null}
    const sharesValueTotal=list.reduce((s,h)=>{const v=holdingValue(h);return v!=null?s+v:s},0)
    const weightOf=(h:Holding)=>{const v=holdingValue(h);return v!=null&&sharesValueTotal>0?v/sharesValueTotal*100:h.weight}
    const trackedWeight=list.reduce((s,h)=>{const price=bySymbol.get(h.symbol);return price!=null&&h.entry_price?s+weightOf(h):s},0)
    if(!(trackedWeight>0))continue
    const returnPct=list.reduce((s,h)=>{
      const price=bySymbol.get(h.symbol);if(price==null||!h.entry_price)return s
      const ret=(price/h.entry_price-1)*100
      return s+ret*(weightOf(h)/trackedWeight)
    },0)
    rows.push({portfolio_id:p.id,user_id:p.user_id,return_pct:returnPct})
  }

  if(rows.length){
    const {error:insertError}=await admin.from('portfolio_snapshots').insert(rows)
    if(insertError)return NextResponse.json({error:insertError.message},{status:500})
  }

  return NextResponse.json({snapshotsWritten:rows.length,portfoliosSkipped:portfolios.length-rows.length,symbolsFetched:bySymbol.size})
}
