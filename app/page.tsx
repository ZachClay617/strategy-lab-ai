'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const STARTING_CAPITAL = 10_000_000_000
const families = ['Trend Following','Mean Reversion','Breakout','Momentum','Volume Confirmation','RSI Regime','Moving Average Cross']
const markets = ['Stocks','Crypto']
const speeds = [
  { key:'slow', label:'Slow', ms:400 },
  { key:'normal', label:'Normal', ms:180 },
  { key:'fast', label:'Fast', ms:60 },
  { key:'turbo', label:'Turbo', ms:5 },
  { key:'realtime', label:'Real-time', ms:60000 },
] as const
const MAX_VARIATIONS = 100000
const MAX_MIN_TRADES = 3000
const CHART_WINDOWS = [
  { label:'50 candles', value:50 },
  { label:'100 candles', value:100 },
  { label:'250 candles', value:250 },
  { label:'500 candles', value:500 },
  { label:'All', value:100000 },
] as const

type Candle = { date:string; open:number; high:number; low:number; close:number; volume:number }
type Trade = { side:'LONG'; entryIndex:number; exitIndex:number; entry:number; exit:number; qty:number; pnl:number; reason:string }
type Strategy = { id:string; name:string; family:string; symbol:string; market:string; score:number; approved:boolean; metrics:any; explanation:string; parameters:any; equity:any; trades:Trade[]; created_at:string }
type Run = { id:string; symbol:string; market:string; status:string; variations_requested:number; best_score:number|null; started_at:string; finished_at:string|null; starting_balance:number; current_balance:number; summary:string|null; best_strategy_name:string|null; best_reason:string|null; failure_reason:string|null; tested_count:number; qualified_count:number }

type Candidate = { family:string; params:any; result:any; passed:boolean; reason:string; index:number }

function fmtMoney(n:number){
  if (!Number.isFinite(n)) return '$0'
  return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n)
}
function fmtPrice(n:number){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n)}
function clamp(n:number,a:number,b:number){return Math.max(a,Math.min(b,n))}
function seeded(seed:number){let x=seed|0;return()=>{x=(x*1664525+1013904223)|0;return(x>>>0)/4294967296}}
function sleep(ms:number){return new Promise(r=>setTimeout(r,ms))}
function makeSynthetic(symbol:string, days:number):Candle[]{const r=seeded(symbol.split('').reduce((a,c)=>a+c.charCodeAt(0),0));let p=100;const out:Candle[]=[];for(let i=0;i<Math.min(days,2500);i++){const ret=(r()-.49)*.04;const open=p;p*=Math.exp(ret);const close=p;const high=Math.max(open,close)*(1+r()*.012);const low=Math.min(open,close)*(1-r()*.012);out.push({date:new Date(Date.now()-(days-i)*86400000).toISOString(),open,high,low,close,volume:500000+r()*4500000})}return out}

function signalFor(data:Candle[], i:number, family:string, p:any){
  const c=data[i].close, prev=data[i-1]?.close||c
  const fastWindow=data.slice(Math.max(0,i-p.fast),i)
  const avg=fastWindow.reduce((s,x)=>s+x.close,0)/(fastWindow.length||1)
  const slowWindow=data.slice(Math.max(0,i-p.slow),i)
  const slow=slowWindow.reduce((s,x)=>s+x.close,0)/(slowWindow.length||1)
  const rsiLike=50+((c-prev)/Math.max(prev,.01))*2500
  let long=false,short=false
  if(family==='Trend Following'){long=c>avg*(1+p.threshold);short=c<avg*(1-p.threshold)}
  if(family==='Mean Reversion'){long=rsiLike<p.rsi;short=rsiLike>100-p.rsi}
  if(family==='Breakout'){const hi=Math.max(...data.slice(Math.max(0,i-p.lookback),i).map(x=>x.close));const lo=Math.min(...data.slice(Math.max(0,i-p.lookback),i).map(x=>x.close));long=c>=hi*(1+p.threshold);short=c<=lo*(1-p.threshold)}
  if(family==='Momentum'){long=c>prev*(1+p.threshold);short=c<prev*(1-p.threshold)}
  if(family==='Volume Confirmation'){const avgv=fastWindow.reduce((s,x)=>s+x.volume,0)/(fastWindow.length||1);long=c>avg&&data[i].volume>avgv*(1+p.vol);short=c<avg}
  if(family==='RSI Regime'){long=rsiLike<p.rsi&&c>avg;short=rsiLike>100-p.rsi||c<avg*(1-p.threshold)}
  if(family==='Moving Average Cross'){long=avg>slow*(1+p.threshold);short=avg<slow*(1-p.threshold)}
  return {long,sell:short}
}

function describeFamily(family:string, p:any){
  const pct=(n:number)=>`${(n*100).toFixed(2)}%`
  if(family==='Trend Following')return `Trend Following buys when price closes more than ${pct(p.threshold)} above its ${p.fast}-candle moving average, and sells once price falls more than ${pct(p.threshold)} below that same average. Indicator: ${p.fast}-period simple moving average.`
  if(family==='Mean Reversion')return `Mean Reversion buys when a short-term momentum reading (a fast RSI-style indicator) drops below ${p.rsi}, betting on a bounce back toward the average, and sells once that reading climbs back above ${100-p.rsi}. Indicator: RSI-style momentum oscillator.`
  if(family==='Breakout')return `Breakout buys when price closes above the highest close of the last ${p.lookback} candles by more than ${pct(p.threshold)}, and sells when price breaks back below the recent low band. Indicator: ${p.lookback}-candle rolling high/low channel.`
  if(family==='Momentum')return `Momentum buys when price rises more than ${pct(p.threshold)} versus the previous candle, and sells when price falls more than ${pct(p.threshold)} versus the previous candle. Indicator: single-candle rate of change.`
  if(family==='Volume Confirmation')return `Volume Confirmation buys when price is above its ${p.fast}-candle average AND volume is running ${pct(p.vol)} above its ${p.fast}-candle average volume, and sells when price falls back below that average. Indicators: ${p.fast}-period price average and ${p.fast}-period volume average.`
  if(family==='RSI Regime')return `RSI Regime buys when the momentum oscillator is below ${p.rsi} while price is still above its ${p.fast}-candle average (a pullback inside an uptrend), and sells when momentum climbs above ${100-p.rsi} or price breaks the average by ${pct(p.threshold)}. Indicators: RSI-style oscillator and ${p.fast}-period moving average.`
  if(family==='Moving Average Cross')return `Moving Average Cross buys when the ${p.fast}-period average crosses more than ${pct(p.threshold)} above the ${p.slow}-period average, and sells when it crosses back below. Indicators: ${p.fast}-period and ${p.slow}-period moving averages.`
  return 'Custom rule set.'
}

function backtest(data:Candle[], family:string, p:any){
  let cash=STARTING_CAPITAL, qty=0, side:'LONG'|null=null, entry=0, entryIndex=0, wins=0, losses=0, trades=0, peak=cash, maxDD=0
  const equity:number[]=[]; const tradeLog:Trade[]=[]
  const riskFraction=.20
  const start=Math.max(35,p.slow,p.lookback)
  for(let i=start;i<data.length;i++){
    const c=data[i].close
    const {long,sell}=signalFor(data,i,family,p)
    if(side===null && long){
      const notional=cash*riskFraction
      qty=notional/Math.max(c,.000001)
      side='LONG';entry=c;entryIndex=i
    } else if(side==='LONG' && sell){
      const pnl=(c-entry)*qty;cash+=pnl;const win=pnl>=0;if(win)wins++;else losses++;trades++;tradeLog.push({side,entryIndex,exitIndex:i,entry,exit:c,qty,pnl,reason:'Sell signal closed the position.'});side=null;qty=0
    }
    const mark=side==='LONG'?cash+((c-entry)*qty):cash
    peak=Math.max(peak,mark);maxDD=Math.max(maxDD,(peak-mark)/Math.max(peak,1));equity.push(mark)
  }
  if(side){const c=data[data.length-1].close;const pnl=(c-entry)*qty;cash+=pnl;const win=pnl>=0;if(win)wins++;else losses++;trades++;tradeLog.push({side,entryIndex,exitIndex:data.length-1,entry,exit:c,qty,pnl,reason:'End-of-test liquidation.'})}
  const ret=(cash/STARTING_CAPITAL-1)*100
  const winRate=trades?wins/trades*100:0
  const daily:number[]=[];for(let i=1;i<equity.length;i++)daily.push((equity[i]-equity[i-1])/Math.max(Math.abs(equity[i-1]),1))
  const mean=daily.reduce((a,b)=>a+b,0)/(daily.length||1);const sd=Math.sqrt(daily.reduce((a,b)=>a+(b-mean)**2,0)/(daily.length||1))||1
  const sharpe=mean/sd*Math.sqrt(252)
  const consistency=clamp(50+ret*.25-maxDD*100*.35+Math.min(trades,100)*.15,0,100)
  const score=clamp(ret*.35+winRate*.3+sharpe*10*.15+consistency*.15-(maxDD*100)*.25,0,100)
  return {metrics:{returnPct:ret,winRate,maxDrawdownPct:maxDD*100,sharpe,consistency,trades,profit:cash-STARTING_CAPITAL,score,wins,losses},equity, trades:tradeLog, endingBalance:cash}
}
function randomParams(r:()=>number){return{fast:Math.floor(5+r()*55),slow:Math.floor(30+r()*120),lookback:Math.floor(10+r()*80),threshold:.001+r()*.03,rsi:25+Math.floor(r()*35),vol:r()*.8}}
function explainCandidate(c:Candidate,minTrades:number){const m=c.result.metrics;if(m.trades<minTrades)return`Rejected: only ${m.trades} completed trades, below the ${minTrades}-trade minimum.`;if(m.winRate<45)return`Rejected: ${m.winRate.toFixed(1)}% win rate is below the required 45%. It finished with ${m.wins} wins and ${m.losses} losses.`;if(m.returnPct<=0)return`Rejected: the strategy reached the win-rate threshold but lost ${Math.abs(m.returnPct).toFixed(2)}% of starting capital.`;if(m.maxDrawdownPct>50)return`Rejected: drawdown reached ${m.maxDrawdownPct.toFixed(1)}%, so the risk profile was too deep.`;return`Qualified: ${m.wins} wins / ${m.losses} losses, ${m.returnPct.toFixed(2)}% return, ${m.maxDrawdownPct.toFixed(1)}% max drawdown and ${m.sharpe.toFixed(2)} Sharpe.`}

function CandleChart({candles,trades,activeIndex,title,live=false,windowSize=50,errorMessage}:{candles:Candle[];trades:Trade[];activeIndex:number;title:string;live?:boolean;windowSize?:number;errorMessage?:string|null}){
  if(errorMessage)return <div className="chart empty error">⚠ {errorMessage}</div>
  const size=Math.max(10,windowSize)
  const half=Math.floor(size*.8)
  const visible=candles.slice(Math.max(0,Math.min(candles.length-size,activeIndex-half)),Math.min(candles.length,Math.max(size,activeIndex+1)))
  if(!visible.length)return <div className="chart empty">Waiting for market data…</div>
  const w=1000,h=460,padL=70,padR=20,padT=20,padB=30,min=Math.min(...visible.map(x=>x.low)),max=Math.max(...visible.map(x=>x.high)),spread=max-min||1,pricePad=spread*.08,adjMin=min-pricePad,adjMax=max+pricePad,range=adjMax-adjMin||1
  const x=(i:number)=>padL+(i/(Math.max(visible.length-1,1)))*(w-padL-padR)
  const y=(v:number)=>h-padB-((v-adjMin)/range)*(h-padT-padB)
  const offset=candles.indexOf(visible[0])
  const markers=trades.filter(t=>t.entryIndex>=offset&&t.entryIndex<offset+visible.length)
  const gridLines=5
  const bodyWidth=Math.max(3,Math.min(14,(w-padL-padR)/visible.length*.62))
  return <div className="chart-wrap"><div className="chart-head"><div><b>{title}</b><span>{live?'LIVE MARKET DATA':'AI RESEARCH SIMULATION'}</span></div><strong>{fmtPrice(candles[Math.min(activeIndex,candles.length-1)]?.close||0)}</strong></div><svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
    {Array.from({length:gridLines}).map((_,i)=>{const v=adjMin+(range*i)/(gridLines-1);const yy=y(v);return <g key={i}><line x1={padL} x2={w-padR} y1={yy} y2={yy} stroke="#ffffff" strokeOpacity=".08" strokeWidth="1"/><text x={padL-8} y={yy+4} fill="#8fa0b8" fontSize="11" textAnchor="end">{fmtPrice(v)}</text></g>})}
    {visible.map((c,i)=>{const up=c.close>=c.open;const cx=x(i),bodyTop=y(Math.max(c.open,c.close)),bodyBottom=y(Math.min(c.open,c.close));const color=up?'#3ddc97':'#ff5c7c';return <g key={c.date}><line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth="1.6"/><rect x={cx-bodyWidth/2} y={bodyTop} width={bodyWidth} height={Math.max(2.2,bodyBottom-bodyTop)} fill={color} stroke={color} strokeWidth="1"/></g>})}
    {markers.map((t,i)=>{const ix=t.entryIndex-offset;const yy=y(t.entry);const exitIx=t.exitIndex-offset;const exitVisible=exitIx>=0&&exitIx<visible.length;const exitYy=y(t.exit);return <g key={`${t.entryIndex}-${i}`}>{exitVisible&&<line x1={x(ix)} y1={yy} x2={x(exitIx)} y2={exitYy} stroke="#8fa0b8" strokeWidth="1.5" strokeDasharray="4 3" opacity=".7"/>}<circle cx={x(ix)} cy={yy} r="6" fill="#57e8ff" stroke="#0a1220" strokeWidth="1.5"/><text x={x(ix)+8} y={yy-8} fill="#57e8ff" fontSize="12" fontWeight="800">BUY</text>{exitVisible&&<><circle cx={x(exitIx)} cy={exitYy} r="6" fill="#ff9b70" stroke="#0a1220" strokeWidth="1.5"/><text x={x(exitIx)+8} y={exitYy-8} fill="#ff9b70" fontSize="12" fontWeight="800">SELL</text></>}</g>})}
  </svg></div>
}

export default function Home(){
 const [session,setSession]=useState<any>(null),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[mode,setMode]=useState<'login'|'signup'>('login'),[msg,setMsg]=useState(''),[strategies,setStrategies]=useState<Strategy[]>([]),[runs,setRuns]=useState<Run[]>([]),[running,setRunning]=useState(false),[progress,setProgress]=useState(0),[feed,setFeed]=useState<string[]>([]),[testLog,setTestLog]=useState<Candidate[]>([]),[selected,setSelected]=useState<Strategy|null>(null),[symbol,setSymbol]=useState('AAPL'),[market,setMarket]=useState('Stocks'),[lookback,setLookback]=useState(1825),[variations,setVariations]=useState(25000),[minTrades,setMinTrades]=useState(10),[idea,setIdea]=useState(''),[runMode,setRunMode]=useState<'paper'|'live'>('paper'),[balance,setBalance]=useState(STARTING_CAPITAL),[researchCandles,setResearchCandles]=useState<Candle[]>([]),[activeIndex,setActiveIndex]=useState(0),[activeTrades,setActiveTrades]=useState<Trade[]>([]),[activeCandidate,setActiveCandidate]=useState<Candidate|null>(null),[liveCandles,setLiveCandles]=useState<Candle[]>([]),[liveStatus,setLiveStatus]=useState('Waiting for live market data'),[selectedRun,setSelectedRun]=useState<Run|null>(null),[speed,setSpeed]=useState<typeof speeds[number]['key']>('normal'),[usingLiveData,setUsingLiveData]=useState(false),[tickerError,setTickerError]=useState<string|null>(null),[watchLive,setWatchLive]=useState(true),[chartWindow,setChartWindow]=useState<number>(100)
 const stopRef=useRef(false)
 const speedMs=speeds.find(s=>s.key===speed)?.ms??180
 useEffect(()=>{if(!supabase)return;supabase.auth.getSession().then(({data})=>setSession(data.session));const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>data.subscription.unsubscribe()},[])
 useEffect(()=>{if(session?.user)loadData()},[session?.user?.id])
 useEffect(()=>{if(!session?.user||market!=='Stocks')return;let dead=false;const load=async()=>{try{const r=await fetch(`/api/market?symbol=${encodeURIComponent(symbol)}&live=1`);const j=await r.json();if(dead)return;if(Array.isArray(j)&&j.length){setLiveCandles(j);setLiveStatus(`Updated ${new Date().toLocaleTimeString()}`);setTickerError(null)}else if(j?.error==='invalid_ticker'){setLiveCandles([]);setTickerError(j.message||`"${symbol}" is not a recognized ticker symbol.`)}else{setLiveStatus('Live feed unavailable')}}catch{if(!dead)setLiveStatus('Live feed unavailable')}};load();const id=setInterval(load,15000);return()=>{dead=true;clearInterval(id)}},[session?.user?.id,symbol,market])
 async function loadData(){if(!supabase||!session?.user)return;const [{data:s,error:sErr},{data:r,error:rErr}]=await Promise.all([supabase.from('strategies').select('*').eq('user_id',session.user.id).order('score',{ascending:false}).limit(100),supabase.from('research_runs').select('*').eq('user_id',session.user.id).order('started_at',{ascending:false}).limit(50)]);if(sErr||rErr){setMsg(`Could not load saved data: ${sErr?.message||rErr?.message}`);return}setMsg('');setStrategies((s||[]) as Strategy[]);setRuns((r||[]) as Run[]);const {data:p}=await supabase.from('profiles').select('current_balance').eq('id',session.user.id).maybeSingle();if(p?.current_balance!=null)setBalance(Number(p.current_balance))}
 async function auth(e:React.FormEvent){e.preventDefault();setMsg('');if(!supabase){setMsg('Add Supabase environment variables first.');return}const res=mode==='signup'?await supabase.auth.signUp({email,password}):await supabase.auth.signInWithPassword({email,password});if(res.error)setMsg(res.error.message);else if(mode==='signup')setMsg('Account created. Check your email if confirmation is enabled.')}
 async function signout(){await supabase?.auth.signOut();setSession(null)}
 async function saveEvent(runId:string,message:string,level='info',pct=0){if(!supabase||!session?.user)return;const {error}=await supabase.from('run_events').insert({run_id:runId,user_id:session.user.id,message,level,progress:pct});if(error)console.error('saveEvent failed',error)}
 async function runResearch(){if(!supabase||!session?.user||running)return;stopRef.current=false;setRunning(true);setProgress(0);setFeed([]);setTestLog([]);setSelectedRun(null);setActiveCandidate(null);const runId=crypto.randomUUID();const started=new Date().toISOString();const {error:runInsertError}=await supabase.from('research_runs').insert({id:runId,user_id:session.user.id,symbol:symbol.toUpperCase(),market,modes:[runMode],variations_requested:variations,status:'running',started_at:started,starting_balance:STARTING_CAPITAL,current_balance:STARTING_CAPITAL,tested_count:0,qualified_count:0,summary:'AI research started.',capital_events:[]});
 if(runInsertError){setMsg(`Could not start the run: ${runInsertError.message}`);setRunning(false);return}
 setMsg('')
 let data:Candle[]=[];const live=runMode==='live'
 if(live){
   try{const res=await fetch(`/api/market?symbol=${encodeURIComponent(symbol)}&live=1&market=${encodeURIComponent(market)}`);const j=await res.json();if(j?.error==='invalid_ticker'){setTickerError(j.message);setMsg(`Could not start the run: ${j.message}`);setRunning(false);await supabase.from('research_runs').delete().eq('id',runId);return}if(!Array.isArray(j)||j.length<40)throw new Error('insufficient live data');data=j;setLiveCandles(j);setLiveStatus(`Updated ${new Date().toLocaleTimeString()}`);setUsingLiveData(true);setTickerError(null);setFeed(f=>['Live execution: testing against real-time market data instead of historical bars.',...f])}
   catch{data=makeSynthetic(symbol,Math.max(lookback,1)); setUsingLiveData(true);setFeed(f=>['Live feed unavailable right now; falling back to historical/simulated data for this run.',...f])}
 } else {
   setUsingLiveData(false)
   try{const res=await fetch(`/api/market?symbol=${encodeURIComponent(symbol)}&days=${lookback}&market=${encodeURIComponent(market)}`);data=await res.json();if((data as any)?.error==='invalid_ticker'){const message=(data as any).message;setTickerError(message);setMsg(`Could not start the run: ${message}`);setRunning(false);await supabase.from('research_runs').delete().eq('id',runId);return}if(!Array.isArray(data)||data.length<60)throw new Error('insufficient data');setTickerError(null)}catch{data=makeSynthetic(symbol,lookback);setFeed(f=>['Market adapter unavailable; using clearly labeled development data.',...f])}
 }
 setResearchCandles(data);setActiveIndex(0);setActiveTrades([])
 const best:any[]=[];let completed=0,qualified=0;const batch=100;const total=Math.max(50,variations)
 for(let b=0;b<total;b+=batch){if(stopRef.current)break;const r=seeded(b+symbol.length*999+Date.now()%10000);for(let j=0;j<Math.min(batch,total-b);j++){const index=completed+1;const family=families[Math.floor(r()*families.length)];const params=randomParams(r);const result=backtest(data,family,params);const passed=result.metrics.trades>=minTrades&&result.metrics.winRate>=45&&result.metrics.returnPct>0&&result.metrics.maxDrawdownPct<50;const candidate={family,params,result,passed,reason:'',index} as Candidate;candidate.reason=explainCandidate(candidate,minTrades);if(passed){qualified++;best.push(candidate);best.sort((a,b)=>b.result.metrics.score-a.result.metrics.score);if(best.length>25)best.pop()}setActiveCandidate(candidate);setActiveTrades(result.trades);setActiveIndex(data.length-1);setTestLog(prev=>[candidate,...prev].slice(0,18));if(index===1||index%250===0||passed){setFeed(f=>[`TEST #${index.toLocaleString()} · ${family} · ${passed?'QUALIFIED':'REJECTED'} · ${candidate.reason}`,...f].slice(0,80));await saveEvent(runId,`Test #${index.toLocaleString()} · ${family} · ${passed?'qualified':'rejected'} · ${candidate.reason}`,passed?'success':'info',index/total*100)}completed++}
 setProgress(completed/total*100);if(completed%500===0||completed===total){const {error}=await supabase.from('research_runs').update({tested_count:completed,qualified_count:qualified,current_balance:STARTING_CAPITAL}).eq('id',runId);if(error)console.error('run progress update failed',error)}
 // observable research cadence, tunable via the speed control
 await sleep(speedMs)
 }
 for(const item of best.slice(0,25)){const m=item.result.metrics;const {error}=await supabase.from('strategies').insert({user_id:session.user.id,run_id:runId,symbol:symbol.toUpperCase(),market,name:`${item.family} / ${Math.round(m.score)} score`,family:item.family,parameters:item.params,source:idea?'AI + user idea':'AI generated',approved:true,score:m.score,metrics:m,equity:item.result.equity,trades:item.result.trades,explanation:`How it works: ${describeFamily(item.family,item.params)} Why it worked: this run generated ${m.wins} wins and ${m.losses} losses for a ${m.winRate.toFixed(1)}% win rate. It returned ${m.returnPct.toFixed(2)}% with ${m.maxDrawdownPct.toFixed(1)}% maximum drawdown and ${m.sharpe.toFixed(2)} Sharpe. The engine only buys and sells (goes long) and closes the position on a sell signal or at the end of the test. This is historical research, not a guarantee of future performance.`});if(error)console.error('strategy save failed',error)}
 const top=best.slice(0,25)
 const bestOne=top[0];const finished=new Date().toISOString();const summary=bestOne?`The research tested ${completed.toLocaleString()} variations. ${qualified.toLocaleString()} met the qualification rules. The leading ${bestOne.family} candidate returned ${bestOne.result.metrics.returnPct.toFixed(2)}%, won ${bestOne.result.metrics.winRate.toFixed(1)}% of ${bestOne.result.metrics.trades} trades, and reached ${bestOne.result.metrics.maxDrawdownPct.toFixed(1)}% max drawdown.`:`The research tested ${completed.toLocaleString()} variations and found no candidate that met all qualification rules. The engine records the rejection reason for each observed test.`
 const {error:finishError}=await supabase.from('research_runs').update({status:stopRef.current?'stopped':'completed',finished_at:finished,best_score:bestOne?.result.metrics.score??null,current_balance:STARTING_CAPITAL,tested_count:completed,qualified_count:qualified,summary,best_strategy_name:bestOne?`${bestOne.family} / ${Math.round(bestOne.result.metrics.score)} score`:null,best_reason:bestOne?bestOne.reason:null,failure_reason:bestOne?null:'No strategy met the 45% win-rate, positive-return, drawdown, and minimum-trade rules.'}).eq('id',runId)
 if(finishError)setMsg(`Run finished but could not save results: ${finishError.message}`)
 await saveEvent(runId,summary,'success',100);setFeed(f=>[summary,...f]);setRunning(false);setProgress(100);await loadData()
 }
 async function resetBalance(){if(!supabase||!session?.user)return;const event={type:'reset',at:new Date().toISOString(),from:balance,to:STARTING_CAPITAL};await supabase.from('capital_events').insert({user_id:session.user.id,event_type:'reset',amount_before:balance,amount_after:STARTING_CAPITAL});await supabase.from('profiles').update({current_balance:STARTING_CAPITAL,starting_balance:STARTING_CAPITAL}).eq('id',session.user.id);setBalance(STARTING_CAPITAL)}
 const chartStrategy=useMemo(()=>selected?.equity||[],[selected])
 if(!session)return <main className="shell auth"><div className="brand">◈ STRATEGY LAB <em>AI</em></div><section className="auth-card"><div className="eyebrow">PERSISTENT RESEARCH PLATFORM</div><h1>Find strategies. <span>Test everything.</span></h1><p className="muted">Accounts and research data are stored in Supabase. Sessions persist across reloads and devices.</p><form onSubmit={auth} className="auth-form"><input type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} required/><input type="password" placeholder="Password (8+ characters)" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required/><button className="primary">{mode==='login'?'ENTER LAB':'CREATE ACCOUNT'}</button></form><button className="link" onClick={()=>setMode(mode==='login'?'signup':'login')}>{mode==='login'?'Need an account? Create one':'Already have an account? Sign in'}</button>{msg&&<div className="msg">{msg}</div>}</section></main>
 return <main className="shell"><header className="topbar"><div className="brand">◈ STRATEGY LAB <em>AI</em></div><div className="top-actions"><span className="pill">{session.user.email}</span><button className="ghost" onClick={signout}>Log out</button></div></header>
 {msg&&<div className="msg banner">{msg}</div>}
 <section className="hero"><div><div className="eyebrow">AI STRATEGY RESEARCH ENGINE</div><h1>Build. Break. <span>Repeat.</span></h1><p className="muted">Watch the engine generate, test, buy and sell, reject weak ideas, and save the strategies that pass the rules.</p></div><div className="balance"><small>AI RESEARCH CAPITAL</small><strong>{fmtMoney(balance)}</strong><button onClick={resetBalance}>RESET TO {fmtMoney(STARTING_CAPITAL)}</button></div></section>
 <div className="grid"><section className="panel"><div className="panel-title"><h2>RUN CONFIGURATION</h2><span className="badge">45% MIN WIN RATE</span></div><label>Ticker symbol<input value={symbol} onChange={e=>{setSymbol(e.target.value.toUpperCase());setTickerError(null)}}/>{tickerError&&<span className="field-warning">⚠ {tickerError}</span>}</label><label>Market<select value={market} onChange={e=>setMarket(e.target.value)}>{markets.map(x=><option key={x}>{x}</option>)}</select></label><label>Lookback<select value={lookback} onChange={e=>setLookback(+e.target.value)}><option value={365}>1 year</option><option value={1095}>3 years</option><option value={1825}>5 years</option><option value={3650}>10 years</option></select></label><label>Strategy variations (up to {MAX_VARIATIONS.toLocaleString()})<input type="number" min={50} max={MAX_VARIATIONS} value={variations} onChange={e=>setVariations(clamp(Math.round(+e.target.value||0),50,MAX_VARIATIONS))}/></label><label>Minimum trades (up to {MAX_MIN_TRADES.toLocaleString()})<input type="number" min={1} max={MAX_MIN_TRADES} value={minTrades} onChange={e=>setMinTrades(clamp(Math.round(+e.target.value||0),1,MAX_MIN_TRADES))}/></label><label>Test speed<select value={speed} onChange={e=>setSpeed(e.target.value as typeof speed)}>{speeds.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select></label><label>User strategy idea<textarea value={idea} onChange={e=>setIdea(e.target.value)} placeholder="Optional: describe a strategy you want tested..."/></label><div className="section-label">TEST SOURCES</div><div className="checks mode-pick">{([['paper','Paper trading / backtesting'],['live','Live execution']] as const).map(([k,label])=><label key={k}><input type="radio" name="runMode" checked={runMode===k} onChange={()=>setRunMode(k)}/>{label}</label>)}</div><button className="run" onClick={runResearch} disabled={running}>{running?`AI TRADING · ${progress.toFixed(1)}%`:'▶ RUN AI SEARCH'}</button><p className="tiny">{runMode==='paper'?'Paper trading / backtesting runs the AI\'s strategy tests by backtesting the selected ticker over the chosen lookback window. No real data feed or broker is touched.':'Live execution runs the AI\'s tests against live, real-time market data instead of historical bars. It never places a real trade or touches a broker account.'}</p></section>
 <section className="panel"><div className="panel-title"><h2>LIVE MARKET CHART</h2><span className="muted">{running&&watchLive?(runMode==='live'?'AI TRADING ON LIVE DATA':'AI TRADING (BACKTEST)'):liveStatus}</span></div><div className="chart-controls"><label className="inline-check"><input type="checkbox" checked={watchLive} onChange={e=>setWatchLive(e.target.checked)}/>Watch AI trade in real time</label><label className="inline-select">Timeframe<select value={chartWindow} onChange={e=>setChartWindow(+e.target.value)}>{CHART_WINDOWS.map(w=><option key={w.value} value={w.value}>{w.label}</option>)}</select></label></div>{(()=>{const displayCandles=researchCandles.length?researchCandles:liveCandles;const displayTrades=watchLive?activeTrades:[];const displayIndex=researchCandles.length?activeIndex:Math.max(0,liveCandles.length-1);const err=!displayCandles.length&&tickerError?tickerError:null;return displayCandles.length||err?<CandleChart candles={displayCandles} trades={displayTrades} activeIndex={displayIndex} windowSize={chartWindow} title={activeCandidate?`TEST #${activeCandidate.index.toLocaleString()} · ${activeCandidate.family}`:`${symbol} · chart`} live={runMode==='live'} errorMessage={err}/>:<div className="chart empty">Run a search to watch the AI trade on this chart.</div>})()}<p className="tiny">This is the chart the AI trades on. The timeframe control only changes what you see — it never changes what data the AI uses to trade.</p></section></div>
 <div className="grid"><section className="panel"><div className="panel-title"><h2>AI TRADING ARENA</h2><span className={running?'live-dot':''}>{running?'ENGINE TRADING':'READY'}</span></div><div className="trade-status"><div><span>Mode</span><b>{runMode==='live'?'Live execution':'Paper trading / backtesting'}</b></div><div><span>Current test</span><b>{activeCandidate?`${activeCandidate.family} · ${activeCandidate.passed?'QUALIFIED':'REJECTED'}`:'—'}</b></div><div><span>Outcome</span><b>{activeCandidate?.reason||'Waiting for the first strategy test.'}</b></div></div></section>
 <section className="panel"><div className="panel-title"><h2>WHAT THE AI IS TESTING</h2><span className="muted">Latest tests</span></div><div className="test-list">{testLog.length?testLog.map(c=><div className={`test-item ${c.passed?'pass':'fail'}`} key={c.index}><div><b>#{c.index.toLocaleString()} · {c.family}</b><span>{c.reason}</span></div><strong>{c.result.metrics.score.toFixed(1)}</strong></div>):<div className="empty">Every observed test will show its strategy, result, and rejection/qualification reason here.</div>}</div></section></div>
 <section className="panel"><div className="panel-title"><h2>SUCCESSFUL STRATEGY LOG</h2><span className="muted">Saved to Supabase · sorted by score</span></div><div className="metrics"><div><span>Approval rule</span><b>≥45% WR + positive return</b></div><div><span>Research capital</span><b>{fmtMoney(STARTING_CAPITAL)}</b></div><div><span>Position mode</span><b>Long only (buy/sell)</b></div><div><span>Market feed</span><b>Live chart</b></div></div><div className="table">{strategies.length===0?<div className="empty">No successful strategies saved yet. Run the engine and qualified strategies will appear here.</div>:strategies.map(s=><button className="row" key={s.id} onClick={()=>setSelected(s)}><div><strong>{s.name}</strong><span>{s.symbol} · {s.market} · {s.family}</span><span className="how-it-works">{describeFamily(s.family,s.parameters)}</span></div><b>{s.score.toFixed(1)}</b><span>{s.metrics?.winRate?.toFixed(1)}% WR</span><span>{s.metrics?.returnPct?.toFixed(1)}% return</span><span>{s.metrics?.maxDrawdownPct?.toFixed(1)}% DD</span><span>{s.metrics?.trades} trades</span></button>)}</div></section>
 {selected&&<section className="panel replay"><div className="panel-title"><h2>STRATEGY REPLAY & WHY IT WORKED</h2><button className="ghost" onClick={()=>setSelected(null)}>CLOSE</button></div><h3>{selected.name}</h3><p className="muted">{selected.explanation}</p><div className="replay-grid"><div><span>Win rate</span><b>{selected.metrics.winRate.toFixed(1)}%</b></div><div><span>Return</span><b>{selected.metrics.returnPct.toFixed(2)}%</b></div><div><span>Drawdown</span><b>{selected.metrics.maxDrawdownPct.toFixed(1)}%</b></div><div><span>Sharpe</span><b>{selected.metrics.sharpe.toFixed(2)}</b></div><div><span>Trades</span><b>{selected.metrics.trades}</b></div></div>{chartStrategy.length&&selected.trades?.length?<CandleChart candles={researchCandles.length?researchCandles:makeSynthetic(selected.symbol,365)} trades={selected.trades} activeIndex={Math.max(0,Math.min((researchCandles.length||365)-1,researchCandles.length-1))} title="Stored strategy trade map"/>:null}</section>}
 <section className="panel"><div className="panel-title"><h2>RESEARCH RUN HISTORY</h2><span className="muted">Click a run for the full outcome</span></div>{runs.length===0?<div className="empty">Your completed research runs will appear here.</div>:runs.map(r=><button className="history" key={r.id} onClick={()=>setSelectedRun(selectedRun?.id===r.id?null:r)}><span><b>{r.symbol} · {r.market}</b><small>{new Date(r.started_at).toLocaleString()}</small></span><span>{(r.tested_count||r.variations_requested).toLocaleString()} tested</span><span>{(r.qualified_count||0).toLocaleString()} qualified</span><span>{r.status}</span><span>{r.best_score?.toFixed(1)??'—'} score</span></button>)}{selectedRun&&<div className="run-detail"><h3>{selectedRun.best_strategy_name||'No qualifying strategy'}</h3><p>{selectedRun.summary||selectedRun.failure_reason||'No summary was stored for this run.'}</p>{selectedRun.best_reason&&<p><b>Why the leader passed:</b> {selectedRun.best_reason}</p>}{selectedRun.failure_reason&&<p><b>Why nothing passed:</b> {selectedRun.failure_reason}</p>}</div>}</section>
 </main>
}
