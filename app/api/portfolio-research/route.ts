import { NextRequest, NextResponse } from 'next/server'
import { PORTFOLIO_UNIVERSE } from '@/lib/portfolioUniverse'
import { GLOBAL_AI_DAILY_LIMIT, checkRateLimit, clientIp, rateLimitedPayload } from '@/lib/rateLimit'
import { getAuthedUserId } from '@/lib/serverAuth'
import { sanitizeStrings } from '@/lib/sanitizeText'
import { fetchDailyCandles } from '@/lib/companyReport'

const KEYWORD_MAP:Record<string,string[]> = {
  tech:['tech','technology','software'],
  ai:['ai','artificial intelligence','machine learning'],
  growth:['growth','aggressive','high growth','high-growth'],
  value:['value','undervalued','cheap'],
  dividend:['dividend','income','yield','payout'],
  defensive:['defensive','safe','stable','conservative','low risk','low-risk'],
  smallcap:['small cap','small-cap','smallcap'],
  largecap:['large cap','large-cap','largecap','blue chip','blue-chip'],
  energy:['energy','oil','gas'],
  healthcare:['healthcare','health','pharma','biotech'],
  financials:['financial','bank','banking'],
  realestate:['real estate','reit','property'],
  utilities:['utility','utilities'],
  ev:['ev','electric vehicle','electric vehicles'],
  crypto:['crypto','bitcoin','blockchain'],
  semiconductor:['semiconductor','chip','chips'],
  index:['index','diversified','broad market','passive'],
  consumer:['consumer','retail'],
  industrials:['industrial','industrials','defense','aerospace'],
  payments:['payments','fintech'],
  cloud:['cloud','saas'],
}

// Uses the app's shared market-data client rather than a second, hand-rolled
// copy of it. The copy that used to live here sent `User-Agent:
// StrategyLabAI/3.0`, which is exactly the kind of request lib/market.ts
// documents the provider as refusing from cloud IPs — so this route was
// quietly getting empty price history for every symbol, dropping them all as
// "no data", and then reporting "Could not fetch real market data" while the
// rest of the app's charts worked fine.
async function fetchDailyCloses(symbol:string):Promise<number[]>{
  const candles=await fetchDailyCandles(symbol,130)
  return candles.map(c=>c.close).filter((v):v is number=>v!=null&&Number.isFinite(v))
}

function statsFor(closes:number[]){
  if(closes.length<10)return null
  const last=closes[closes.length-1]
  const ret=(n:number)=>{const i=Math.max(0,closes.length-1-n);return (last/closes[i]-1)*100}
  const daily:number[]=[];for(let i=1;i<closes.length;i++)daily.push(closes[i]/closes[i-1]-1)
  const mean=daily.reduce((a,b)=>a+b,0)/daily.length
  const sd=Math.sqrt(daily.reduce((a,b)=>a+(b-mean)**2,0)/daily.length)
  const volatility=sd*Math.sqrt(252)*100
  return {lastClose:last,return20d:ret(20),return60d:ret(60),volatility}
}

function extractKeywords(description:string){
  const d=description.toLowerCase()
  const found=new Set<string>()
  for(const [tag,phrases] of Object.entries(KEYWORD_MAP))for(const p of phrases)if(d.includes(p)){found.add(tag);break}
  return found
}

export async function POST(req:NextRequest){
  // Fans out a Yahoo daily-closes fetch across the portfolio universe, so it's
  // meaningfully heavier than a single candle request — throttle accordingly.
  const rl=await checkRateLimit('portfolio-research',clientIp(req),[
    {limit:10,windowMs:60_000,label:'burst'},
    {limit:60,windowMs:3_600_000,label:'hourly'},
  ])
  if(!rl.ok){
    const p=rateLimitedPayload(rl)
    return NextResponse.json(p.body,{status:p.status,headers:p.headers})
  }

  // Must be a real, logged-in Supabase user — this route can trigger a paid
  // Anthropic call and was previously reachable by anyone on the internet
  // with only a per-IP rate limit standing between them and your bill.
  const userId=await getAuthedUserId(req)
  if(!userId)return NextResponse.json({error:'You must be logged in to run portfolio research.'},{status:401})

  // A per-account daily ceiling on top of the per-IP limit above.
  const userRl=await checkRateLimit('portfolio-research-user',userId,[
    {limit:15,windowMs:86_400_000,label:'daily'},
  ])
  if(!userRl.ok){
    const p=rateLimitedPayload(userRl,"You've reached today's portfolio research limit for your account — please try again tomorrow.")
    return NextResponse.json(p.body,{status:p.status,headers:p.headers})
  }

  // Deployment-wide daily ceiling. Accounts are free and self-serve, so the
  // per-account cap above bounds one account, not the bill — someone with N
  // throwaway accounts just multiplies it. This is the limit that bounds what
  // a bad day can actually cost.
  const globalRl=await checkRateLimit('portfolio-research-global','all',[
    {limit:GLOBAL_AI_DAILY_LIMIT,windowMs:86_400_000,label:'global-daily'},
  ])
  if(!globalRl.ok){
    const p=rateLimitedPayload(globalRl,'Portfolio research is temporarily paused — this service has hit its daily capacity. Please try again tomorrow.')
    return NextResponse.json(p.body,{status:p.status,headers:p.headers})
  }

  const body=await req.json().catch(()=>null)
  if(!body)return NextResponse.json({error:'invalid_request'},{status:400})
  // Bound the prompt inputs so a hostile client can't inflate token costs.
  const description:string=String(body.description||'').slice(0,2000)
  const currentHoldings:{symbol:string;weight:number}[]=(Array.isArray(body.holdings)?body.holdings:[])
    .slice(0,60)
    .filter((h:any)=>typeof h?.symbol==='string'&&/^[A-Z0-9.^=-]{1,15}$/i.test(h.symbol))
    .map((h:any)=>({symbol:String(h.symbol).toUpperCase(),weight:Number(h.weight)||0}))
  if(!description.trim())return NextResponse.json({error:'A portfolio description is required before the AI can research it.'},{status:400})

  const keywords=extractKeywords(description)
  const heldSymbols=new Set(currentHoldings.map(h=>h.symbol.toUpperCase()))
  const candidates=PORTFOLIO_UNIVERSE.filter(u=>heldSymbols.has(u.symbol)||keywords.size===0||u.tags.some(t=>keywords.has(t)))
  const pool=(candidates.length>=8?candidates:PORTFOLIO_UNIVERSE).slice(0,40)
  const symbols=Array.from(new Set([...pool.map(p=>p.symbol),...Array.from(heldSymbols)]))

  const dataEntries=await Promise.all(symbols.map(async sym=>{
    const closes=await fetchDailyCloses(sym)
    const s=statsFor(closes)
    const meta=PORTFOLIO_UNIVERSE.find(u=>u.symbol===sym)
    return s?{symbol:sym,sector:meta?.sector||'Unknown',tags:meta?.tags||[],...s}:null
  }))
  const marketData=dataEntries.filter((v):v is NonNullable<typeof v>=>v!=null)
  if(!marketData.length)return NextResponse.json({error:'Could not fetch real market data for any candidate symbol right now. Try again shortly.'},{status:502})

  const apiKey=process.env.ANTHROPIC_API_KEY
  // Distinguishes "there is no key" from "the key is fine but the call
  // failed", so the fallback summary below can say which actually happened.
  let aiFailed=false
  if(apiKey){
    try{
      const prompt=`You are an educational research tool that generates EXAMPLE model portfolios for learning purposes. You are not an investment adviser, you know nothing about the person's finances, goals, or risk tolerance, and your output is not personalized advice or a recommendation — it is an illustrative example allocation matching a written theme.\n\nPortfolio theme description:\n"""${description}"""\n\nSymbols currently recorded in this tracking portfolio (context only): ${currentHoldings.length?JSON.stringify(currentHoldings):'(empty — this is a new portfolio)'}\n\nReal market data (last close and trailing returns/volatility computed from real daily bars) for every symbol you may choose from — you MUST only pick symbols from this preset list:\n${JSON.stringify(marketData)}\n\nBuild an example portfolio that matches the written theme using this real data. You do not have to hold every symbol, do not have to weight them equally, and may pick anywhere from 3 to 15 symbols. Keep each rationale factual and data-driven; never promise or predict returns, and never phrase anything as advice about what the person should do. Respond with ONLY strict JSON, no markdown, no prose outside the JSON, in exactly this shape:\n{"holdings":[{"symbol":"XXXX","weight":0-100 number,"rationale":"one sentence why this symbol fits the theme, citing the real data"}],"summary":"2-3 sentence factual summary of the example allocation and how it maps to the theme"}\nWeights must sum to 100.`
      const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:'claude-sonnet-5',max_tokens:2000,messages:[{role:'user',content:prompt}]})})
      const j=await r.json()
      if(!r.ok||j?.error){console.error('Anthropic API error',r.status,JSON.stringify(j));aiFailed=true}
      const text=Array.isArray(j?.content)?j.content.find((b:any)=>b?.type==='text')?.text:undefined
      if(!text)console.error('Anthropic response had no text content',JSON.stringify(j).slice(0,2000))
      if(text){
        const parsed=JSON.parse(text.slice(text.indexOf('{'),text.lastIndexOf('}')+1))
        const validSymbols=new Set(marketData.map(m=>m.symbol))
        const holdings=(parsed.holdings||[]).filter((h:any)=>validSymbols.has(String(h.symbol).toUpperCase())).map((h:any)=>({symbol:String(h.symbol).toUpperCase(),weight:Number(h.weight)||0,rationale:String(h.rationale||'')}))
        const total=holdings.reduce((s:number,h:any)=>s+h.weight,0)||1
        const normalized=holdings.map((h:any)=>({...h,weight:Math.round(h.weight/total*1000)/10,entryPrice:marketData.find(m=>m.symbol===h.symbol)?.lastClose}))
        if(normalized.length)return NextResponse.json(sanitizeStrings({mode:'ai',holdings:normalized,summary:parsed.summary||'',dataAsOf:new Date().toISOString(),universeSize:marketData.length}))
        console.error('AI returned zero valid holdings after filtering',JSON.stringify(parsed).slice(0,2000))
      }
    }catch(e){console.error('portfolio AI call failed, falling back to heuristic',e);aiFailed=true}
  }

  const scored=marketData.map(m=>{
    const tagMatches=m.tags.filter(t=>keywords.has(t)).length
    const score=tagMatches*15+m.return60d*.5-Math.max(0,m.volatility-25)*.3
    return {...m,score}
  }).sort((a,b)=>b.score-a.score)
  const picked=scored.slice(0,Math.min(10,Math.max(5,scored.length))).filter(s=>s.score>-50)
  const positiveTotal=picked.reduce((s,p)=>s+Math.max(1,p.score+50),0)
  const holdings=picked.map(p=>({symbol:p.symbol,weight:Math.round(Math.max(1,p.score+50)/positiveTotal*1000)/10,entryPrice:p.lastClose,rationale:`${p.return60d>=0?'Up':'Down'} ${Math.abs(p.return60d).toFixed(1)}% over 60 real trading days with ${p.volatility.toFixed(1)}% annualized volatility${p.tags.some(t=>keywords.has(t))?`, matches "${p.tags.find(t=>keywords.has(t))}" in your description`:''}.`}))

  // Say which of the two reasons this actually is. Reporting "no AI key is
  // configured" when the key is fine and the AI call simply failed sends the
  // owner looking for a configuration problem that doesn't exist.
  const why=aiFailed
    ? 'The AI analysis could not be completed for this run, so this fell back to'
    : 'No AI key is configured, so this used'
  return NextResponse.json({mode:'heuristic',holdings,summary:`${why} a rules-based screen of ${marketData.length} real, live-priced candidates ranked by trailing momentum, volatility, and how well each matched your description.`,dataAsOf:new Date().toISOString(),universeSize:marketData.length})
}
