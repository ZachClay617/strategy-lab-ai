import { NextRequest, NextResponse } from 'next/server'
import { PORTFOLIO_UNIVERSE } from '@/lib/portfolioUniverse'

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

async function fetchDailyCloses(symbol:string):Promise<number[]>{
  try{
    const now=Math.floor(Date.now()/1000)
    const period1=now-130*86400
    const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${now}&interval=1d&includeAdjustedClose=true`
    const r=await fetch(url,{headers:{'User-Agent':'StrategyLabAI/3.0'},cache:'no-store'})
    const j=await r.json().catch(()=>null)
    const x=j?.chart?.result?.[0]
    if(!x)return []
    const q=x.indicators.quote[0]
    const a=x.indicators.adjclose?.[0]?.adjclose||q.close
    return (a as (number|null)[]).filter((v):v is number=>v!=null)
  }catch{return []}
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
  const body=await req.json().catch(()=>null)
  if(!body)return NextResponse.json({error:'invalid_request'},{status:400})
  const description:string=body.description||''
  const currentHoldings:{symbol:string;weight:number}[]=Array.isArray(body.holdings)?body.holdings:[]
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
  if(apiKey){
    try{
      const prompt=`You are managing a real-money-tracked (paper) stock portfolio for a user based on their plain-language description.\n\nUser's description of what they want this portfolio to do:\n"""${description}"""\n\nCurrent holdings: ${currentHoldings.length?JSON.stringify(currentHoldings):'(empty — this is a new portfolio)'}\n\nReal market data (live, last close and trailing returns/volatility computed from real daily bars) for every symbol you may choose from — you MUST only pick symbols from this list:\n${JSON.stringify(marketData)}\n\nDecide the best portfolio to match the user's description using this real data. You do not have to hold every symbol, do not have to weight them equally, and may pick anywhere from 3 to 15 symbols at your discretion. Respond with ONLY strict JSON, no markdown, no prose outside the JSON, in exactly this shape:\n{"holdings":[{"symbol":"XXXX","weight":0-100 number,"rationale":"one sentence why, citing the real data"}],"summary":"2-3 sentence summary of the overall strategy and why these weights"}\nWeights must sum to 100.`
      const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:'claude-sonnet-5',max_tokens:2000,messages:[{role:'user',content:prompt}]})})
      const j=await r.json()
      const text=j?.content?.[0]?.text
      if(text){
        const parsed=JSON.parse(text.slice(text.indexOf('{'),text.lastIndexOf('}')+1))
        const validSymbols=new Set(marketData.map(m=>m.symbol))
        const holdings=(parsed.holdings||[]).filter((h:any)=>validSymbols.has(String(h.symbol).toUpperCase())).map((h:any)=>({symbol:String(h.symbol).toUpperCase(),weight:Number(h.weight)||0,rationale:String(h.rationale||'')}))
        const total=holdings.reduce((s:number,h:any)=>s+h.weight,0)||1
        const normalized=holdings.map((h:any)=>({...h,weight:Math.round(h.weight/total*1000)/10}))
        if(normalized.length)return NextResponse.json({mode:'ai',holdings:normalized,summary:parsed.summary||'',dataAsOf:new Date().toISOString(),universeSize:marketData.length})
      }
    }catch(e){console.error('portfolio AI call failed, falling back to heuristic',e)}
  }

  const scored=marketData.map(m=>{
    const tagMatches=m.tags.filter(t=>keywords.has(t)).length
    const score=tagMatches*15+m.return60d*.5-Math.max(0,m.volatility-25)*.3
    return {...m,score}
  }).sort((a,b)=>b.score-a.score)
  const picked=scored.slice(0,Math.min(10,Math.max(5,scored.length))).filter(s=>s.score>-50)
  const positiveTotal=picked.reduce((s,p)=>s+Math.max(1,p.score+50),0)
  const holdings=picked.map(p=>({symbol:p.symbol,weight:Math.round(Math.max(1,p.score+50)/positiveTotal*1000)/10,rationale:`${p.return60d>=0?'Up':'Down'} ${Math.abs(p.return60d).toFixed(1)}% over 60 real trading days with ${p.volatility.toFixed(1)}% annualized volatility${p.tags.some(t=>keywords.has(t))?`, matches "${p.tags.find(t=>keywords.has(t))}" in your description`:''}.`}))

  return NextResponse.json({mode:'heuristic',holdings,summary:`No AI key is configured, so this used a rules-based screen of ${marketData.length} real, live-priced candidates ranked by trailing momentum, volatility, and how well each matched your description.`,dataAsOf:new Date().toISOString(),universeSize:marketData.length})
}
