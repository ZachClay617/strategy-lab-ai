'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const STARTING_CAPITAL = 10_000_000_000
const families = ['Trend Following','Mean Reversion','Breakout','Momentum','Volume Confirmation','RSI Regime','Moving Average Cross']
const markets = ['Stocks','Crypto']
const speeds = [
  { key:'slow', label:'Slow · 1 test / 3s', ms:3000 },
  { key:'normal', label:'Normal · 1 test / s', ms:1000 },
  { key:'fast', label:'Fast · 10 tests / s', ms:100 },
  { key:'turbo', label:'Turbo · 50 tests / s', ms:20 },
  { key:'ultraTurbo', label:'Ultra Turbo · 150 tests / s', ms:Math.round(1000/150) },
  { key:'god', label:'God Speed · 500 tests / s', ms:Math.round(1000/500) },
] as const
const MAX_VARIATIONS = 100000
const MAX_MIN_TRADES = 3000
const CANDLE_MINUTES = 15
const SESSION_START_MIN=9*60, SESSION_END_MIN=12*60
const SESSION_RANGE_DAYS = 55
// Real historical depth from the free data feed is limited by bar size: 15-minute
// bars are only retained for ~55 days, hourly for ~2 years, daily for 10+ years.
// To give the AI a genuinely real 10-year testing pool, each test's date decides
// which real bar size is used, and a matching maximum trade-hold rule applies so
// a position can never span more real time than one bar of that size reasonably
// represents.
const RESOLUTION_TIERS = [
  { key:'15m', label:'15-Minute', minutes:15, rangeDays:SESSION_RANGE_DAYS, maxDaysAgo:SESSION_RANGE_DAYS, holdLabel:'must close within the 9:00 AM–12:00 PM ET session' },
  { key:'1h', label:'Hourly', minutes:60, rangeDays:730, maxDaysAgo:730, holdLabel:'must close within 3 days of opening' },
  { key:'1d', label:'Daily', minutes:1440, rangeDays:3650, maxDaysAgo:3650, holdLabel:'must close within 5 trading days of opening' },
] as const
type TierKey = typeof RESOLUTION_TIERS[number]['key']
function maxHoldMsFor(tierKey:TierKey){
  if(tierKey==='1h')return 3*24*60*60*1000
  if(tierKey==='1d')return 5*24*60*60*1000
  return undefined
}
const MAX_CHART_SPAN_MS = 7*24*60*60*1000
function fmtDuration(ms:number){
  const mins=Math.round(ms/60000)
  if(mins<60)return `${mins}m`
  const hours=mins/60
  if(hours<24)return `${hours.toFixed(hours%1?1:0)}h`
  return `${(hours/24).toFixed(1)}d`
}

type Candle = { date:string; open:number; high:number; low:number; close:number; volume:number }
type Trade = { side:'LONG'; entryIndex:number; exitIndex:number; entry:number; exit:number; qty:number; pnl:number; reason:string }
type Session = { candles:Candle[]; trades:Trade[]; metrics:any; startDate?:string; endDate?:string; tier?:string }
type Strategy = { id:string; run_id?:string; name:string; family:string; symbol:string; market:string; score:number; approved:boolean; metrics:any; explanation:string; parameters:any; equity:any; trades:Trade[]; candles?:Candle[]; test_start_at?:string|null; test_end_at?:string|null; sessions?:Session[]; created_at:string }
type Run = { id:string; symbol:string; market:string; status:string; variations_requested:number; best_score:number|null; started_at:string; finished_at:string|null; starting_balance:number; current_balance:number; summary:string|null; best_strategy_name:string|null; best_reason:string|null; failure_reason:string|null; tested_count:number; qualified_count:number; favorite?:boolean }

type Candidate = { family:string; params:any; result:any; passed:boolean; reason:string; index:number; candles:Candle[]; startDate?:string; endDate?:string; sessions:Session[]; testedAt:string }

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

function backtest(data:Candle[], family:string, p:any, maxHoldMs?:number, startingCash:number=STARTING_CAPITAL){
  let cash=startingCash, qty=0, side:'LONG'|null=null, entry=0, entryIndex=0, wins=0, losses=0, trades=0, peak=cash, maxDD=0
  const equity:number[]=[]; const tradeLog:Trade[]=[]
  const riskFraction=.02
  const start=Math.max(3,p.slow,p.lookback)
  for(let i=start;i<data.length;i++){
    const c=data[i].close
    const {long,sell}=signalFor(data,i,family,p)
    const heldTooLong=side==='LONG'&&maxHoldMs!=null&&(new Date(data[i].date).getTime()-new Date(data[entryIndex].date).getTime())>=maxHoldMs
    if(side===null && long){
      const notional=cash*riskFraction
      qty=notional/Math.max(c,.000001)
      side='LONG';entry=c;entryIndex=i
    } else if(side==='LONG' && (sell||heldTooLong)){
      const pnl=(c-entry)*qty;cash+=pnl;const win=pnl>=0;if(win)wins++;else losses++;trades++;tradeLog.push({side,entryIndex,exitIndex:i,entry,exit:c,qty,pnl,reason:heldTooLong&&!sell?'Maximum hold time reached for this bar size; position closed automatically.':'Sell signal closed the position.'});side=null;qty=0
    }
    const mark=side==='LONG'?cash+((c-entry)*qty):cash
    peak=Math.max(peak,mark);maxDD=Math.max(maxDD,(peak-mark)/Math.max(peak,1));equity.push(mark)
  }
  if(side){const c=data[data.length-1].close;const pnl=(c-entry)*qty;cash+=pnl;const win=pnl>=0;if(win)wins++;else losses++;trades++;tradeLog.push({side,entryIndex,exitIndex:data.length-1,entry,exit:c,qty,pnl,reason:'End-of-test liquidation.'})}
  const ret=(cash/startingCash-1)*100
  const winRate=trades?wins/trades*100:0
  const daily:number[]=[];for(let i=1;i<equity.length;i++)daily.push((equity[i]-equity[i-1])/Math.max(Math.abs(equity[i-1]),1))
  const mean=daily.reduce((a,b)=>a+b,0)/(daily.length||1);const sd=Math.sqrt(daily.reduce((a,b)=>a+(b-mean)**2,0)/(daily.length||1))||1
  const sharpe=mean/sd*Math.sqrt(252)
  const consistency=clamp(50+ret*.25-maxDD*100*.35+Math.min(trades,100)*.15,0,100)
  const score=clamp(ret*.35+winRate*.3+sharpe*10*.15+consistency*.15-(maxDD*100)*.25,0,100)
  return {metrics:{returnPct:ret,winRate,maxDrawdownPct:maxDD*100,sharpe,consistency,trades,profit:cash-startingCash,score,wins,losses},equity, trades:tradeLog, endingBalance:cash}
}
// combines a strategy's per-session results into one set of metrics, so qualification (including minimum trades) applies to the whole strategy across every session it was tested on, not just one
function aggregateMetrics(list:any[]){
  const trades=list.reduce((s,m)=>s+m.trades,0)
  const wins=list.reduce((s,m)=>s+m.wins,0)
  const losses=list.reduce((s,m)=>s+m.losses,0)
  const profit=list.reduce((s,m)=>s+m.profit,0)
  const winRate=trades?wins/trades*100:0
  const returnPct=list.length?list.reduce((s,m)=>s+m.returnPct,0)/list.length:0
  const maxDrawdownPct=list.length?Math.max(...list.map(m=>m.maxDrawdownPct)):0
  const sharpe=list.length?list.reduce((s,m)=>s+m.sharpe,0)/list.length:0
  const consistency=clamp(50+returnPct*.25-maxDrawdownPct*.35+Math.min(trades,100)*.15,0,100)
  const score=clamp(returnPct*.35+winRate*.3+sharpe*10*.15+consistency*.15-maxDrawdownPct*.25,0,100)
  return {returnPct,winRate,maxDrawdownPct,sharpe,consistency,trades,profit,score,wins,losses}
}
function randomParams(r:()=>number){return{fast:Math.floor(5+r()*55),slow:Math.floor(30+r()*120),lookback:Math.floor(10+r()*80),threshold:.001+r()*.03,rsi:25+Math.floor(r()*35),vol:r()*.8}}
function fmtDateTime(iso?:string){if(!iso)return '—';return new Date(iso).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'})}
function fmtClock(iso?:string){if(!iso)return '—';return new Date(iso).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'})}
function etParts(iso:string){
  const d=new Date(iso)
  const fmt=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})
  const parts:any={}
  fmt.formatToParts(d).forEach(p=>{if(p.type!=='literal')parts[p.type]=p.value})
  let hour=+parts.hour; if(hour===24)hour=0
  return {dayKey:`${parts.year}-${parts.month}-${parts.day}`, minutesOfDay:hour*60+(+parts.minute)}
}
function extractMorningSessions(data:Candle[]):Record<string,Candle[]>{
  const byDay:Record<string,Candle[]>={}
  for(const c of data){
    const {dayKey,minutesOfDay}=etParts(c.date)
    if(minutesOfDay<SESSION_START_MIN||minutesOfDay>=SESSION_END_MIN)continue
    ;(byDay[dayKey] ||= []).push(c)
  }
  return byDay
}
function randomWindow(data:Candle[], r:()=>number, minutesPerBar:number=15){
  const weekCapBars=Math.max(1,Math.floor(MAX_CHART_SPAN_MS/(minutesPerBar*60000)))
  const minLen=Math.min(data.length,60,weekCapBars)
  if(data.length<=minLen)return data
  const maxStart=data.length-minLen
  const start=Math.floor(r()*maxStart)
  const remaining=data.length-start
  const maxExtra=Math.min(remaining-minLen,200,weekCapBars-minLen)
  const len=Math.max(minLen,Math.floor(minLen+r()*Math.max(0,maxExtra)))
  return data.slice(start,Math.min(data.length,start+len))
}
function clampParamsToSession(p:any, len:number){
  const cap=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v))
  return {...p,
    fast:Math.round(cap(p.fast,2,Math.max(2,Math.floor(len*.35)))),
    slow:Math.round(cap(p.slow,3,Math.max(3,Math.floor(len*.6)))),
    lookback:Math.round(cap(p.lookback,2,Math.max(2,Math.floor(len*.5)))),
  }
}
function sma(data:Candle[], i:number, period:number){const from=Math.max(0,i-period);const w=data.slice(from,i+1);return w.length?w.reduce((s,x)=>s+x.close,0)/w.length:data[i].close}
function indicatorSeries(data:Candle[], family:string, p:any):{label:string,color:string,values:(number|null)[]}{
  const n=data.length
  const values:(number|null)[]=new Array(n).fill(null)
  if(family==='Breakout'){
    for(let i=0;i<n;i++){if(i<p.lookback){values[i]=null;continue}values[i]=Math.max(...data.slice(i-p.lookback,i).map(x=>x.close))}
    return {label:`${p.lookback}-candle high channel`,color:'#ffd166',values}
  }
  if(family==='Moving Average Cross'){
    for(let i=0;i<n;i++){values[i]=i<2?null:sma(data,i,p.slow)}
    return {label:`${p.slow}-period average`,color:'#ffd166',values}
  }
  for(let i=0;i<n;i++){values[i]=i<2?null:sma(data,i,p.fast)}
  return {label:`${p.fast}-period average`,color:'#ffd166',values}
}
function categorizeRejection(m:any):string|null{
  if(m.trades<=0)return 'No completed trades'
  if(m.winRate<45)return 'Win rate below 45%'
  if(m.returnPct<.025)return 'Return below 0.025%'
  if(m.maxDrawdownPct>=8)return 'Drawdown at or above 8%'
  if(m.sharpe<.85||m.sharpe>1.5)return 'Sharpe outside 0.85–1.50'
  return null
}
function tierLabel(key?:string){if(key==='live')return 'live 1-minute'; const t=RESOLUTION_TIERS.find(x=>x.key===key); return t?`${t.label} (${t.holdLabel})`:key||'unknown'}
function explainCandidate(c:Candidate,sessionsTested:number){const m=c.result.metrics;const n=sessionsTested||c.sessions?.length||1;const bar=tierLabel(c.sessions?.[0]?.tier);if(m.trades<=0)return`Rejected: no completed trades across ${n} tested session${n>1?'s':''} on ${bar} bars.`;if(m.winRate<45)return`Rejected: ${m.winRate.toFixed(1)}% win rate is below the required 45% on ${bar} bars. It finished with ${m.wins} wins and ${m.losses} losses.`;if(m.returnPct<.025)return`Rejected: ${m.returnPct.toFixed(3)}% return is below the required 0.025% minimum on ${bar} bars.`;if(m.maxDrawdownPct>=8)return`Rejected: drawdown reached ${m.maxDrawdownPct.toFixed(1)}%, above the required 8% max on ${bar} bars.`;if(m.sharpe<.85||m.sharpe>1.5)return`Rejected: ${m.sharpe.toFixed(2)} Sharpe is outside the required 0.85–1.50 range on ${bar} bars.`;return`Qualified on ${bar} bars: ${m.wins} wins / ${m.losses} losses, ${m.returnPct.toFixed(2)}% return, ${m.maxDrawdownPct.toFixed(1)}% max drawdown and ${m.sharpe.toFixed(2)} Sharpe.`}

function CandleChart({candles,trades,activeIndex,title,live=false,windowSize=14,errorMessage,indicator}:{candles:Candle[];trades:Trade[];activeIndex:number;title:string;live?:boolean;windowSize?:number;errorMessage?:string|null;indicator?:{label:string,color:string,values:(number|null)[]}|null}){
  if(errorMessage)return <div className="chart empty error">⚠ {errorMessage}</div>
  const size=Math.max(4,windowSize)
  const half=Math.floor(size*.8)
  const visible=candles.slice(Math.max(0,Math.min(candles.length-size,activeIndex-half)),Math.min(candles.length,Math.max(size,activeIndex+1)))
  if(!visible.length)return <div className="chart empty">Waiting for market data…</div>
  const up=visible[visible.length-1]?.close>=visible[0]?.open
  const w=1000,h=460,padL=64,padR=16,padT=20,padB=34,min=Math.min(...visible.map(x=>x.low)),max=Math.max(...visible.map(x=>x.high)),spread=max-min||1,pricePad=spread*.1,adjMin=min-pricePad,adjMax=max+pricePad,range=adjMax-adjMin||1
  const x=(i:number)=>padL+(i/(Math.max(visible.length-1,1)))*(w-padL-padR)
  const y=(v:number)=>h-padB-((v-adjMin)/range)*(h-padT-padB)
  const offset=candles.indexOf(visible[0])
  const markers=trades.filter(t=>t.entryIndex>=offset&&t.entryIndex<offset+visible.length)
  const gridLines=4
  const bodyWidth=Math.max(4,Math.min(22,(w-padL-padR)/visible.length*.58))
  let indicatorPath=''
  if(indicator){
    let started=false
    for(let i=0;i<visible.length;i++){
      const v=indicator.values[offset+i]
      if(v==null){started=false;continue}
      indicatorPath+=`${started?'L':'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `
      started=true
    }
  }
  const isDailyish=visible.length>1&&(new Date(visible[1].date).getTime()-new Date(visible[0].date).getTime())>=20*3600*1000
  const tickLabel=(iso?:string)=>{if(!iso)return '';return isDailyish?new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}):fmtClock(iso)}
  const timeTickCount=Math.min(visible.length,5)
  const timeTicks=Array.from({length:timeTickCount}).map((_,k)=>{
    const i=Math.round(k*(visible.length-1)/Math.max(1,timeTickCount-1))
    return {i,label:tickLabel(visible[i]?.date)}
  })
  const lastClose=candles[Math.min(activeIndex,candles.length-1)]?.close||0
  return <div className="chart-wrap rh"><div className="chart-head"><div><b>{title}</b><span>{live?'LIVE MARKET DATA':'AI RESEARCH SIMULATION'}{indicator?` · ${indicator.label}`:''}</span></div><strong className={up?'up':'down'}>{fmtPrice(lastClose)}</strong></div><svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
    {Array.from({length:gridLines}).map((_,i)=>{const v=adjMin+(range*i)/(gridLines-1);const yy=y(v);return <g key={i}><line x1={padL} x2={w-padR} y1={yy} y2={yy} stroke="#ffffff" strokeOpacity=".06" strokeWidth="1"/><text x={padL-8} y={yy+4} fill="#6b7690" fontSize="11" textAnchor="end">{fmtPrice(v)}</text></g>})}
    {visible.map((c,i)=>{const rise=c.close>=c.open;const cx=x(i),bodyTop=y(Math.max(c.open,c.close)),bodyBottom=y(Math.min(c.open,c.close));const color=rise?'#00c805':'#ff5000';return <g key={c.date}><title>{`${fmtDateTime(c.date)}\nOpen ${fmtPrice(c.open)} · High ${fmtPrice(c.high)} · Low ${fmtPrice(c.low)} · Close ${fmtPrice(c.close)}`}</title><line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth="1.4"/><rect x={cx-bodyWidth/2} y={bodyTop} width={bodyWidth} height={Math.max(2,bodyBottom-bodyTop)} fill={color} rx="1.5"/></g>})}
    {indicatorPath&&<path d={indicatorPath} fill="none" stroke={indicator!.color} strokeWidth="1.6" opacity=".8"/>}
    {markers.map((t,i)=>{const ix=t.entryIndex-offset;const yy=y(t.entry);const exitIx=t.exitIndex-offset;const exitVisible=exitIx>=0&&exitIx<visible.length;const exitYy=y(t.exit);return <g key={`${t.entryIndex}-${i}`}>{exitVisible&&<line x1={x(ix)} y1={yy} x2={x(exitIx)} y2={exitYy} stroke="#8fa0b8" strokeWidth="1.3" strokeDasharray="4 3" opacity=".6"/>}<circle cx={x(ix)} cy={yy} r="5.5" fill="#57e8ff" stroke="#05070d" strokeWidth="1.5"/><text x={x(ix)+7} y={yy-7} fill="#57e8ff" fontSize="11" fontWeight="800">BUY</text>{exitVisible&&<><circle cx={x(exitIx)} cy={exitYy} r="5.5" fill="#ff9b70" stroke="#05070d" strokeWidth="1.5"/><text x={x(exitIx)+7} y={exitYy-7} fill="#ff9b70" fontSize="11" fontWeight="800">SELL</text></>}</g>})}
    {timeTicks.map((t,k)=><text key={k} x={x(t.i)} y={h-10} fill="#6b7690" fontSize="11" textAnchor="middle">{t.label}</text>)}
  </svg></div>
}

// Run state lives at module scope (not in component state) so a research run keeps
// executing — and stays controllable via Stop/Pause — across client-side navigation
// to another page and back, instead of being orphaned on the unmounted component.
type SpeedKey = typeof speeds[number]['key']
type RunSnapshot = {
  running:boolean; paused:boolean; progress:number; feed:string[]; testLog:Candidate[]
  activeCandidate:Candidate|null; researchCandles:Candle[]; activeIndex:number; activeTrades:Trade[]
  rejectionCounts:Record<string,number>; tickerError:string|null; selectedRun:Run|null; balance:number
  symbol:string; market:string; runMode:'paper'|'live'; speedKey:SpeedKey
}
let runSnapshot:RunSnapshot={running:false,paused:false,progress:0,feed:[],testLog:[],activeCandidate:null,researchCandles:[],activeIndex:0,activeTrades:[],rejectionCounts:{},tickerError:null,selectedRun:null,balance:STARTING_CAPITAL,symbol:'AAPL',market:'Stocks',runMode:'paper',speedKey:'normal'}
const runListeners=new Set<()=>void>()
function patchRun(patch:Partial<RunSnapshot>|((s:RunSnapshot)=>Partial<RunSnapshot>)){
  const delta=typeof patch==='function'?patch(runSnapshot):patch
  runSnapshot={...runSnapshot,...delta}
  runListeners.forEach(fn=>fn())
}
function subscribeRun(cb:()=>void){runListeners.add(cb);return ()=>{runListeners.delete(cb)}}
function getRunSnapshot(){return runSnapshot}
let stopFlag=false, pauseFlag=false, skipFlag=false, speedMsFlag:number=speeds.find(s=>s.key==='normal')!.ms
async function sleepSkippable(){
  const total=speedMsFlag
  if(total<=20){await sleep(total);skipFlag=false;return}
  const start=Date.now()
  while(Date.now()-start<total){
    if(stopFlag||skipFlag)break
    await sleep(Math.min(20,total-(Date.now()-start)))
  }
  skipFlag=false
}
async function waitWhilePaused(){
  while(pauseFlag&&!stopFlag)await sleep(150)
}

export default function Home(){
 const [session,setSession]=useState<any>(null),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[mode,setMode]=useState<'login'|'signup'>('login'),[msg,setMsg]=useState(''),[showPassword,setShowPassword]=useState(false),[strategies,setStrategies]=useState<Strategy[]>([]),[runs,setRuns]=useState<Run[]>([]),[selected,setSelected]=useState<Strategy|null>(null),[variations,setVariations]=useState(25000),[minTrades,setMinTrades]=useState(1),[idea,setIdea]=useState(''),[liveCandles,setLiveCandles]=useState<Candle[]>([]),[liveStatus,setLiveStatus]=useState('Waiting for live market data'),[watchLive,setWatchLive]=useState(true),[chartWindow,setChartWindow]=useState<number>(14),[runSort,setRunSort]=useState<'newest'|'oldest'|'qualified'|'bestScore'>('newest'),[expandedRuns,setExpandedRuns]=useState<Record<string,boolean>>({}),[symbolNames,setSymbolNames]=useState<Record<string,string>>({}),[avatarUrl,setAvatarUrl]=useState<string|null>(null),[signupUsername,setSignupUsername]=useState('')
 const rs=useSyncExternalStore(subscribeRun,getRunSnapshot,getRunSnapshot)
 const {running,paused,progress,feed,testLog,activeCandidate,researchCandles,activeIndex,activeTrades,rejectionCounts,tickerError,selectedRun,balance,symbol,market,runMode,speedKey:speed}=rs
 useEffect(()=>{if(!supabase)return;supabase.auth.getSession().then(({data})=>setSession(data.session));const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>data.subscription.unsubscribe()},[])
 useEffect(()=>{if(session?.user)loadData()},[session?.user?.id])
 useEffect(()=>{
   if(!session?.user||symbol in symbolNames)return
   let dead=false
   fetch(`/api/market?names=${encodeURIComponent(symbol)}`).then(r=>r.json()).then(j=>{if(!dead&&j&&typeof j==='object')setSymbolNames(prev=>({...prev,...j}))}).catch(()=>{})
   return()=>{dead=true}
 },[session?.user?.id,symbol,market])
 useEffect(()=>{if(!session?.user)return;let dead=false;const load=async()=>{try{const r=await fetch(`/api/market?symbol=${encodeURIComponent(symbol)}&live=1`);const j=await r.json();if(dead)return;if(Array.isArray(j)&&j.length){setLiveCandles(j);setLiveStatus(`Updated ${new Date().toLocaleTimeString()}`);patchRun({tickerError:null})}else if(j?.error==='invalid_ticker'){setLiveCandles([]);patchRun({tickerError:j.message||`"${symbol}" is not a recognized ticker symbol.`})}else{setLiveStatus('Live feed unavailable')}}catch{if(!dead)setLiveStatus('Live feed unavailable')}};load();const id=setInterval(load,15000);return()=>{dead=true;clearInterval(id)}},[session?.user?.id,symbol,market])
 async function loadData(){
   if(!supabase||!session?.user)return
   const isJwtIssue=(e:any)=>{const m=(e?.message||'').toLowerCase();return m.includes('jwt')||m.includes('token')}
   const fetchAll=()=>Promise.all([supabase!.from('strategies').select('*').eq('user_id',session.user.id).order('score',{ascending:false}).limit(200),supabase!.from('research_runs').select('*').eq('user_id',session.user.id).order('started_at',{ascending:false}).limit(50)])
   let [{data:s,error:sErr},{data:r,error:rErr}]=await fetchAll()
   if(isJwtIssue(sErr)||isJwtIssue(rErr)){
     await supabase.auth.refreshSession()
     ;[{data:s,error:sErr},{data:r,error:rErr}]=await fetchAll()
   }
   if(sErr||rErr){
     if(isJwtIssue(sErr)||isJwtIssue(rErr)){
       setMsg('Your session token was invalid, so you were signed out. Please log back in.')
       await supabase.auth.signOut();setSession(null)
     } else {
       setMsg(`Could not load saved data: ${sErr?.message||rErr?.message}`)
     }
     return
   }
   setMsg('');setStrategies((s||[]) as Strategy[]);setRuns((r||[]) as Run[]);const {data:p}=await supabase.from('profiles').select('current_balance,avatar_url').eq('id',session.user.id).maybeSingle();if(p?.current_balance!=null&&!runSnapshot.running)patchRun({balance:Number(p.current_balance)});setAvatarUrl(p?.avatar_url||null)
 }
 async function resolveLoginEmail(identifier:string):Promise<{email?:string;error?:string}>{
   const id=identifier.trim()
   if(id.includes('@'))return {email:id}
   const {data,error}=await supabase!.rpc('get_email_for_username',{uname:id})
   if(error)return {error:error.message}
   if(!data)return {error:'No account found with that username.'}
   return {email:data as string}
 }
 async function auth(e:React.FormEvent){
   e.preventDefault();setMsg('')
   if(!supabase){setMsg('Add Supabase environment variables first.');return}
   if(mode==='signup'){
     const res=await supabase.auth.signUp({email,password})
     if(res.error){setMsg(res.error.message);return}
     if(signupUsername.trim()&&res.data.user){
       const {error:unameErr}=await supabase.from('profiles').upsert({id:res.data.user.id,username:signupUsername.trim()})
       if(unameErr){setMsg(`Account created, but that username could not be saved (${unameErr.message}). You can set one later in Account settings.`);return}
     }
     setMsg('Account created. Check your email if confirmation is enabled.')
     return
   }
   const resolved=await resolveLoginEmail(email)
   if(resolved.error){setMsg(resolved.error);return}
   const res=await supabase.auth.signInWithPassword({email:resolved.email!,password})
   if(res.error)setMsg(res.error.message)
 }
 async function forgotPassword(){
   setMsg('')
   if(!supabase){setMsg('Add Supabase environment variables first.');return}
   if(!email.trim()){setMsg('Enter your email or username above first, then click "Forgot password?" again.');return}
   const resolved=await resolveLoginEmail(email)
   if(resolved.error){setMsg(resolved.error);return}
   const {error}=await supabase.auth.resetPasswordForEmail(resolved.email!,{redirectTo:`${window.location.origin}/reset-password`})
   if(error){setMsg(error.message);return}
   setMsg('Password reset email sent. Check your inbox for a link to set a new password.')
 }
 async function saveEvent(runId:string,message:string,level='info',pct=0){if(!supabase||!session?.user)return;const {error}=await supabase.from('run_events').insert({run_id:runId,user_id:session.user.id,message,level,progress:pct});if(error)console.error('saveEvent failed',error)}
 async function runResearch(){if(!supabase||!session?.user||runSnapshot.running)return;stopFlag=false;pauseFlag=false;skipFlag=false;speedMsFlag=speeds.find(s=>s.key===runSnapshot.speedKey)?.ms??1000;patchRun({paused:false,running:true,progress:0,feed:[],testLog:[],selectedRun:null,activeCandidate:null,rejectionCounts:{}});const runId=crypto.randomUUID();const started=new Date().toISOString();const startingCapitalForRun=balance;const {error:runInsertError}=await supabase.from('research_runs').insert({id:runId,user_id:session.user.id,symbol:symbol.toUpperCase(),market,modes:[runMode],variations_requested:variations,status:'running',started_at:started,starting_balance:startingCapitalForRun,current_balance:startingCapitalForRun,tested_count:0,qualified_count:0,summary:'AI research started.',capital_events:[]});
 if(runInsertError){setMsg(`Could not start the run: ${runInsertError.message}`);patchRun({running:false});return}
 setMsg('')
 let data:Candle[]=[];const live=runMode==='live'
 let sessionDayMap:Record<string,Candle[]>={};let sessionDayKeys:string[]=[]
 let hourlyData:Candle[]=[];let dailyData:Candle[]=[]
 if(live){
   try{const res=await fetch(`/api/market?symbol=${encodeURIComponent(symbol)}&live=1&market=${encodeURIComponent(market)}`);const j=await res.json();if(j?.error==='invalid_ticker'){patchRun({tickerError:j.message,running:false});setMsg(`Could not start the run: ${j.message}`);await supabase.from('research_runs').delete().eq('id',runId);return}if(!Array.isArray(j)||j.length<40)throw new Error('insufficient live data');data=j;setLiveCandles(j);setLiveStatus(`Updated ${new Date().toLocaleTimeString()}`);patchRun(s=>({tickerError:null,feed:['Live execution: testing against real-time market data instead of historical bars.',...s.feed]}))}
   catch{data=makeSynthetic(symbol,5); patchRun(s=>({feed:['Live feed unavailable right now; falling back to simulated data for this run.',...s.feed]}))}
 } else {
   const fetchTier=(interval:string,rangeDays:number)=>fetch(`/api/market?symbol=${encodeURIComponent(symbol)}&market=${encodeURIComponent(market)}&interval=${interval}&rangeDays=${rangeDays}`).then(r=>r.json()).catch(()=>null)
   const [d15,d1h,d1d]=await Promise.all([fetchTier('15m',SESSION_RANGE_DAYS),fetchTier('1h',730),fetchTier('1d',3650)])
   const invalid=[d15,d1h,d1d].find((d:any)=>d?.error==='invalid_ticker') as any
   if(invalid){patchRun({tickerError:invalid.message,running:false});setMsg(`Could not start the run: ${invalid.message}`);await supabase.from('research_runs').delete().eq('id',runId);return}
   if(Array.isArray(d15)&&d15.length){data=d15;sessionDayMap=extractMorningSessions(d15);sessionDayKeys=Object.keys(sessionDayMap).filter(k=>sessionDayMap[k].length>=4).sort()}
   if(Array.isArray(d1h)&&d1h.length)hourlyData=d1h
   if(Array.isArray(d1d)&&d1d.length)dailyData=d1d
   if(!data.length)data=dailyData.length?dailyData:(hourlyData.length?hourlyData:makeSynthetic(symbol,60))
   if(!sessionDayKeys.length&&!hourlyData.length&&!dailyData.length){setMsg('Could not load any real historical data for this ticker. Try a different symbol.');patchRun({running:false});await supabase.from('research_runs').delete().eq('id',runId);return}
   patchRun(s=>({tickerError:null,feed:[`Real historical data loaded — 15-Minute: ${sessionDayKeys.length} sessions (~${SESSION_RANGE_DAYS}d), Hourly: ${hourlyData.length?`${hourlyData.length} bars (~2y)`:'unavailable'}, Daily: ${dailyData.length?`${dailyData.length} bars (~10y)`:'unavailable'}. Each test's date decides which real bar size and max hold rule applies.`,...s.feed]}))
 }
 const pickTier=(r:()=>number)=>{
   const avail=RESOLUTION_TIERS.filter(t=>t.key==='15m'?sessionDayKeys.length:t.key==='1h'?hourlyData.length:dailyData.length)
   return avail.length?avail[Math.floor(r()*avail.length)]:null
 }
 patchRun({researchCandles:data,activeIndex:0,activeTrades:[]})
 const best:any[]=[];let completed=0,qualified=0;const batch=100;const total=Math.max(50,variations);let capital=startingCapitalForRun;const rejections:Record<string,number>={}
 outer: for(let b=0;b<total;b+=batch){if(stopFlag)break;const r=seeded(b+symbol.length*999+Date.now()%10000);for(let j=0;j<Math.min(batch,total-b);j++){
   await waitWhilePaused();if(stopFlag)break outer
   const index=completed+1;const family=families[Math.floor(r()*families.length)];const params=randomParams(r)
   let sessions:Session[]=[];let storedParams=params;let pickedTier:typeof RESOLUTION_TIERS[number]|null=null
   const runSession=(tier:typeof RESOLUTION_TIERS[number],rr:()=>number,useParams:any):Session=>{
     if(tier.key==='15m'){
       const dk=sessionDayKeys[Math.floor(rr()*sessionDayKeys.length)]
       const cds=sessionDayMap[dk];const p2=clampParamsToSession(useParams,cds.length)
       const res=backtest(cds,family,p2,undefined,capital)
       return {candles:cds,trades:res.trades,metrics:res.metrics,startDate:cds[0]?.date,endDate:cds[cds.length-1]?.date,tier:'15m'}
     }
     const sourceData=tier.key==='1h'?hourlyData:dailyData;const holdMs=maxHoldMsFor(tier.key)
     const slice=randomWindow(sourceData,rr,tier.minutes);const p2=clampParamsToSession(useParams,slice.length)
     const res=backtest(slice,family,p2,holdMs,capital)
     return {candles:slice,trades:res.trades,metrics:res.metrics,startDate:slice[0]?.date,endDate:slice[slice.length-1]?.date,tier:tier.key}
   }
   if(live){
     const result=backtest(data,family,params,undefined,capital)
     sessions=[{candles:data,trades:result.trades,metrics:result.metrics,startDate:data[0]?.date,endDate:data[data.length-1]?.date,tier:'live'}]
   } else {
     const tier=pickTier(r)
     if(!tier){completed++;continue}
     pickedTier=tier
     for(let n=0;n<minTrades;n++){
       const sess=runSession(tier,r,params)
       if(n===0)storedParams=clampParamsToSession(params,sess.candles.length)
       sessions.push(sess)
     }
   }
   const agg=aggregateMetrics(sessions.map(s=>s.metrics))
   const passed=agg.trades>0&&agg.winRate>=45&&agg.returnPct>=.025&&agg.maxDrawdownPct<8&&agg.sharpe>=.85&&agg.sharpe<=1.5
   const primary=sessions[0]
   let sampleSessions=sessions.slice(0,10)
   if(passed&&pickedTier&&sampleSessions.length<10){
     const extra:Session[]=[]
     for(let k=sampleSessions.length;k<10;k++)extra.push(runSession(pickedTier,r,storedParams))
     sampleSessions=sampleSessions.concat(extra)
   }
   const candidate={family,params:storedParams,result:{metrics:agg,trades:primary.trades},passed,reason:'',index,candles:primary.candles,startDate:primary.startDate,endDate:primary.endDate,sessions:sampleSessions,testedAt:new Date().toISOString()} as Candidate
   candidate.reason=explainCandidate(candidate,sessions.length)
   if(passed){qualified++;capital+=agg.profit;patchRun({balance:capital});best.push(candidate);best.sort((a,b)=>b.result.metrics.score-a.result.metrics.score);if(best.length>25)best.pop()}
   else{const cat=categorizeRejection(agg);if(cat)rejections[cat]=(rejections[cat]||0)+1}
   const uiStride=speedMsFlag<=2?25:speedMsFlag<=10?5:1
   if(passed||index===1||index%uiStride===0){patchRun(s=>({activeCandidate:candidate,researchCandles:primary.candles,activeTrades:primary.trades,activeIndex:primary.candles.length-1,testLog:[candidate,...s.testLog].slice(0,200),rejectionCounts:{...rejections}}))}
   if(index===1||index%250===0||passed){patchRun(s=>({feed:[`TEST #${index.toLocaleString()} · ${family} · ${passed?'QUALIFIED':'REJECTED'} · ${candidate.reason}`,...s.feed].slice(0,80)}));await saveEvent(runId,`Test #${index.toLocaleString()} · ${family} · ${passed?'qualified':'rejected'} · ${candidate.reason}`,passed?'success':'info',index/total*100)}
   completed++
   if(completed%uiStride===0||completed===total)patchRun({progress:completed/total*100})
   if(completed%500===0||completed===total){const {error}=await supabase.from('research_runs').update({tested_count:completed,qualified_count:qualified,current_balance:capital}).eq('id',runId);if(error)console.error('run progress update failed',error)}
   if(stopFlag)break outer
   await sleepSkippable()
 }
 }
 let strategySaveError:string|null=null
 for(const item of best.slice(0,25)){const m=item.result.metrics;const {error}=await supabase.from('strategies').insert({user_id:session.user.id,run_id:runId,symbol:symbol.toUpperCase(),market,name:`${item.family} / ${Math.round(m.score)} score`,family:item.family,parameters:item.params,source:idea?'AI + user idea':'AI generated',approved:true,score:m.score,metrics:m,equity:item.result.equity,trades:item.result.trades,candles:item.candles,test_start_at:item.startDate,test_end_at:item.endDate,sessions:item.sessions,explanation:`How it works: ${describeFamily(item.family,item.params)} Bar size: real ${tierLabel(item.sessions?.[0]?.tier)} bars. Why it worked: this run generated ${m.wins} wins and ${m.losses} losses for a ${m.winRate.toFixed(1)}% win rate. It returned ${m.returnPct.toFixed(2)}% with ${m.maxDrawdownPct.toFixed(1)}% maximum drawdown and ${m.sharpe.toFixed(2)} Sharpe. The engine only buys and sells (goes long) and closes the position on a sell signal, a maximum-hold rule for the bar size, or at the end of the test. This is historical research on real market data, not a guarantee of future performance.`});if(error){console.error('strategy save failed',error);strategySaveError=error.message}}
 const top=best.slice(0,25)
 const bestOne=top[0];const finished=new Date().toISOString();const summary=bestOne?`The research tested ${completed.toLocaleString()} variations. ${qualified.toLocaleString()} met the qualification rules. The leading ${bestOne.family} candidate returned ${bestOne.result.metrics.returnPct.toFixed(2)}%, won ${bestOne.result.metrics.winRate.toFixed(1)}% of ${bestOne.result.metrics.trades} trades, and reached ${bestOne.result.metrics.maxDrawdownPct.toFixed(1)}% max drawdown.`:`The research tested ${completed.toLocaleString()} variations and found no candidate that met all qualification rules. The engine records the rejection reason for each observed test.`
 const {error:finishError}=await supabase.from('research_runs').update({status:stopFlag?'stopped':'completed',finished_at:finished,best_score:bestOne?.result.metrics.score??null,current_balance:capital,tested_count:completed,qualified_count:qualified,summary,best_strategy_name:bestOne?`${bestOne.family} / ${Math.round(bestOne.result.metrics.score)} score`:null,best_reason:bestOne?bestOne.reason:null,failure_reason:bestOne?null:'No strategy met the 45% win-rate, 0.025% minimum return, 8% max drawdown, 0.85-1.50 Sharpe, and minimum-trade rules.'}).eq('id',runId)
 if(finishError)setMsg(`Run finished but could not save results: ${finishError.message}`)
 else if(strategySaveError)setMsg(`Run finished, but qualified strategies could not be saved: ${strategySaveError}. Run the latest Supabase migration and try again.`)
 const {error:balanceError}=await supabase.from('profiles').upsert({id:session.user.id,current_balance:capital})
 if(balanceError)setMsg(`Run finished, but capital could not be saved: ${balanceError.message}`)
 await saveEvent(runId,summary,'success',100);patchRun(s=>({feed:[summary,...s.feed],running:false,paused:false,progress:100,rejectionCounts:{...rejections},balance:capital}));await loadData()
 }
 async function resetBalance(){if(!supabase||!session?.user)return;await supabase.from('capital_events').insert({user_id:session.user.id,event_type:'reset',amount_before:balance,amount_after:STARTING_CAPITAL});const {error}=await supabase.from('profiles').upsert({id:session.user.id,current_balance:STARTING_CAPITAL,starting_balance:STARTING_CAPITAL});if(error){setMsg(`Could not save the reset: ${error.message}`);return}patchRun({balance:STARTING_CAPITAL})}
 async function toggleFavoriteRun(runId:string){if(!supabase)return;const run=runs.find(r=>r.id===runId);const next=!run?.favorite;setRuns(prev=>prev.map(r=>r.id===runId?{...r,favorite:next}:r));const {error}=await supabase.from('research_runs').update({favorite:next}).eq('id',runId);if(error){setMsg(`Could not update favorite: ${error.message}. Run the latest Supabase migration.`);setRuns(prev=>prev.map(r=>r.id===runId?{...r,favorite:!next}:r))}}
 if(!session)return <main className="shell auth"><div className="brand">◈ STRATEGY LAB <em>AI</em></div><section className="auth-card"><div className="eyebrow">PERSISTENT RESEARCH PLATFORM</div><h1>Find strategies. <span>Test everything.</span></h1><p className="muted">Accounts and research data are stored in Supabase. Sessions persist across reloads and devices.</p><form onSubmit={auth} className="auth-form"><input type={mode==='signup'?'email':'text'} placeholder={mode==='signup'?'you@example.com':'Email or username'} value={email} onChange={e=>setEmail(e.target.value)} required/>{mode==='signup'&&<input type="text" placeholder="Username (optional)" value={signupUsername} onChange={e=>setSignupUsername(e.target.value)}/>}<div className="password-field"><input type={showPassword?'text':'password'} placeholder="Password (8+ characters)" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required/><button type="button" className="password-toggle" onClick={()=>setShowPassword(s=>!s)}>{showPassword?'HIDE':'SHOW'}</button></div><button className="primary">{mode==='login'?'ENTER LAB':'CREATE ACCOUNT'}</button></form><div className="auth-links"><button className="link" onClick={()=>setMode(mode==='login'?'signup':'login')}>{mode==='login'?'Need an account? Create one':'Already have an account? Sign in'}</button>{mode==='login'&&<button className="link" onClick={forgotPassword}>Forgot password?</button>}</div>{msg&&<div className="msg">{msg}</div>}</section></main>
 return <main className="shell"><header className="topbar"><div className="brand">◈ STRATEGY LAB <em>AI</em></div><div className="top-actions"><Link href="/account" className="account-pill" title="Account settings">{avatarUrl?<img src={avatarUrl} alt="Account"/>:<span>{(session.user.email||'?').charAt(0).toUpperCase()}</span>}</Link></div></header>
 {msg&&<div className="msg banner">{msg}</div>}
 <section className="hero"><div><div className="eyebrow">AI STRATEGY RESEARCH ENGINE</div><h1>Build. Break. <span>Repeat.</span></h1><p className="muted">Watch the engine generate, test, buy and sell, reject weak ideas, and save the strategies that pass the rules.</p></div><div className="balance"><small>AI RESEARCH CAPITAL</small><strong>{fmtMoney(balance)}</strong>{(()=>{const pl=balance-STARTING_CAPITAL;const plPct=pl/STARTING_CAPITAL*100;const up=pl>=0;return <div className={`pl ${up?'up':'down'}`}>{up?'▲':'▼'} {fmtMoney(Math.abs(pl))} ({up?'+':'-'}{Math.abs(plPct).toFixed(2)}%)</div>})()}<button onClick={resetBalance}>RESET TO {fmtMoney(STARTING_CAPITAL)}</button></div></section>
 <div className="grid"><section className="panel"><div className="panel-title"><h2>RUN CONFIGURATION</h2><span className="badge">45% MIN WIN RATE</span></div><label>Ticker symbol<input value={symbol} onChange={e=>patchRun({symbol:e.target.value.toUpperCase(),tickerError:null})} onBlur={e=>{if(market==='Crypto'&&e.target.value&&!e.target.value.includes('-'))patchRun({symbol:`${e.target.value.toUpperCase()}-USD`})}} placeholder={market==='Crypto'?'e.g. BTC-USD':'e.g. AAPL'}/>{market==='Crypto'&&<span className="tiny">Yahoo Finance crypto format: SYMBOL-USD (e.g. BTC-USD, ETH-USD, SOL-USD).</span>}{tickerError&&<span className="field-warning">⚠ {tickerError}</span>}</label><label>Market<select value={market} onChange={e=>{const nextMarket=e.target.value;patchRun(s=>({market:nextMarket,symbol:nextMarket==='Crypto'&&s.symbol&&!s.symbol.includes('-')?`${s.symbol}-USD`:s.symbol}))}}>{markets.map(x=><option key={x}>{x}</option>)}</select></label><p className="tiny">Every test uses real historical data spanning up to 10 years. Recent dates (~{SESSION_RANGE_DAYS} days) trade real 15-minute candles within the 9:00 AM–12:00 PM ET session; older dates (~2 years) trade real hourly candles with a 3-day max hold; the oldest dates (up to 10 years) trade real daily candles with a 5-day max hold. Every chart window is capped at 1 week of real time. A strategy can only qualify with a max drawdown under 8% and a Sharpe ratio between 0.85 and 1.50. Every saved strategy states which bar size it used.</p><label>Strategy variations (up to {MAX_VARIATIONS.toLocaleString()})<input type="number" min={50} max={MAX_VARIATIONS} value={variations} onChange={e=>setVariations(clamp(Math.round(+e.target.value||0),50,MAX_VARIATIONS))}/></label><label>Minimum trades — fewest real historical sessions each strategy is tested on before it can qualify (up to {MAX_MIN_TRADES.toLocaleString()})<input type="number" min={1} max={MAX_MIN_TRADES} value={minTrades} onChange={e=>setMinTrades(clamp(Math.round(+e.target.value||0),1,MAX_MIN_TRADES))}/></label><label>Test speed<select value={speed} onChange={e=>{const key=e.target.value as SpeedKey;patchRun({speedKey:key});speedMsFlag=speeds.find(s=>s.key===key)?.ms??1000}}>{speeds.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select></label><label>User strategy idea<textarea value={idea} onChange={e=>setIdea(e.target.value)} placeholder="Optional: describe a strategy you want tested..."/></label><div className="section-label">TEST SOURCES</div><div className="checks mode-pick">{([['paper','Paper trading / backtesting'],['live','Live execution']] as const).map(([k,label])=><label key={k}><input type="radio" name="runMode" checked={runMode===k} onChange={()=>patchRun({runMode:k})}/>{label}</label>)}</div><button className="run" onClick={runResearch} disabled={running}>{running?`AI TRADING · ${progress.toFixed(1)}%`:'▶ START A-TAMP STRATEGY RESEARCH'}</button>{running&&<div className="run-controls"><button className="ghost" onClick={()=>{pauseFlag=!pauseFlag;patchRun({paused:pauseFlag})}}>{paused?'▶ Resume':'⏸ Pause'}</button><button className="ghost" onClick={()=>{skipFlag=true}} disabled={paused}>⏭ Skip strategy</button><button className="ghost stop" onClick={()=>{stopFlag=true;pauseFlag=false;patchRun({paused:false})}}>⏹ Stop</button></div>}<p className="tiny">{runMode==='paper'?'Paper trading / backtesting backtests the selected ticker on real historical bars, one random date at a time across up to 10 years. No real data feed or broker is touched.':'Live execution runs the AI\'s tests against live, real-time market data instead of historical bars. It never places a real trade or touches a broker account.'}</p></section>
 <section className="panel"><div className="panel-title"><h2>LIVE MARKET CHART</h2><span className="muted">{running&&watchLive?(runMode==='live'?'AI TRADING ON LIVE DATA':'AI TRADING (BACKTEST)'):liveStatus}</span></div><div className="chart-controls"><label className="inline-check"><input type="checkbox" checked={watchLive} onChange={e=>setWatchLive(e.target.checked)}/>Watch AI trade</label><div className="zoom-controls"><span>Zoom</span><button className="ghost small-btn" onClick={()=>setChartWindow(w=>clamp(w-2,4,60))}>−</button><button className="ghost small-btn" onClick={()=>setChartWindow(w=>clamp(w+2,4,60))}>+</button></div></div>{runMode==='paper'&&activeCandidate&&(()=>{const tier=activeCandidate.sessions?.[0]?.tier;const range=tier==='15m'?`${fmtDateTime(activeCandidate.startDate)} (${fmtClock(activeCandidate.startDate)}–${fmtClock(activeCandidate.endDate)} ET)`:`${fmtDateTime(activeCandidate.startDate)} → ${fmtDateTime(activeCandidate.endDate)}`;return <div className="tiny test-window">Testing {symbol} on <b>{range}</b> · real <b>{tierLabel(tier)}</b> bars</div>})()}{(()=>{const displayCandles=watchLive&&researchCandles.length?researchCandles:liveCandles;const displayTrades=watchLive?activeTrades:[];const displayIndex=watchLive&&researchCandles.length?activeIndex:Math.max(0,liveCandles.length-1);const err=!displayCandles.length&&tickerError?tickerError:null;const ind=activeCandidate&&displayCandles===researchCandles?indicatorSeries(displayCandles,activeCandidate.family,activeCandidate.params):null;return displayCandles.length||err?<CandleChart candles={displayCandles} trades={displayTrades} activeIndex={displayIndex} windowSize={chartWindow} title={activeCandidate?`TEST #${activeCandidate.index.toLocaleString()} · ${activeCandidate.family}`:`${symbol}${symbolNames[symbol]?` · ${symbolNames[symbol]}`:''}`} live={runMode==='live'} errorMessage={err} indicator={ind}/>:<div className="chart empty">Run a search to watch the AI trade on this chart.</div>})()}<p className="tiny">This is the chart the AI trades on. Zoom only changes what you see — it never changes what data the AI uses to trade.</p></section></div>
 <div className="grid"><section className="panel"><div className="panel-title"><h2>AI TRADING ARENA</h2><span className={running?'live-dot':''}>{running?'ENGINE TRADING':'READY'}</span></div><div className="trade-status"><div><span>Mode</span><b>{runMode==='live'?'Live execution':'Paper trading / backtesting'}</b></div><div><span>Current test</span><b>{activeCandidate?`${activeCandidate.family} · ${activeCandidate.passed?'QUALIFIED':'REJECTED'}`:'—'}</b></div><div><span>Outcome</span><b>{activeCandidate?.reason||'Waiting for the first strategy test.'}</b></div></div></section>
 <section className="panel"><div className="panel-title"><h2>WHAT THE AI IS TESTING</h2><span className="muted">Scroll for more · {testLog.length} shown</span></div>{(()=>{const entries=Object.entries(rejectionCounts).sort((a,b)=>b[1]-a[1]).slice(0,3);if(!entries.length)return null;const total=Object.values(rejectionCounts).reduce((a,b)=>a+b,0);const ordinal=['Top reason','2nd most common reason','3rd most common reason'];return <div className="rejection-breakdown">{entries.map(([reason,count],i)=><div key={reason} className="rejection-row"><span className="rejection-rank">{ordinal[i]}</span><span className="rejection-label">{reason}</span><span className="rejection-count">{count.toLocaleString()} ({(count/total*100).toFixed(1)}%)</span></div>)}</div>})()}<div className="test-list">{testLog.length?testLog.map(c=><div className={`test-item ${c.passed?'pass':'fail'}`} key={`${c.index}-${c.testedAt}`}><div className="test-item-main"><b>#{c.index.toLocaleString()} · {c.family}</b><span>{c.reason}</span></div><div className="test-item-stats"><span>{c.result.metrics.winRate.toFixed(1)}% WR</span><span>{c.result.metrics.maxDrawdownPct.toFixed(1)}% DD</span><span>{fmtDateTime(c.testedAt)}</span><strong>{c.result.metrics.score.toFixed(1)}</strong></div></div>):<div className="empty">Every observed test will show its strategy, result, and rejection/qualification reason here.</div>}</div></section></div>
 {selected&&<section className="panel replay"><div className="panel-title"><h2>STRATEGY REPLAY & WHY IT WORKED</h2><button className="ghost" onClick={()=>setSelected(null)}>CLOSE</button></div><h3>{selected.name}</h3><p className="tiny">Completed {fmtDateTime(selected.created_at)}</p><p className="muted">{selected.explanation}</p><div className="replay-grid"><div><span>Win rate</span><b>{selected.metrics.winRate.toFixed(1)}%</b></div><div><span>Return</span><b>{selected.metrics.returnPct.toFixed(2)}%</b></div><div><span>Drawdown</span><b>{selected.metrics.maxDrawdownPct.toFixed(1)}%</b></div><div><span>Sharpe</span><b>{selected.metrics.sharpe.toFixed(2)}</b></div><div><span>Trades</span><b>{selected.metrics.trades}</b></div></div>
 {(()=>{const sessionsList=selected.sessions?.length?selected.sessions:(selected.candles?.length?[{candles:selected.candles,trades:selected.trades,metrics:selected.metrics,startDate:selected.test_start_at||undefined,endDate:selected.test_end_at||undefined}]:[])
 if(!sessionsList.length)return <div className="chart empty">No stored chart for this strategy yet — run the migration and generate a new strategy to see its chart.</div>
 return sessionsList.map((sess,si)=>{const range=sess.tier==='15m'?`${fmtDateTime(sess.startDate)} (${fmtClock(sess.startDate)}–${fmtClock(sess.endDate)} ET)`:`${fmtDateTime(sess.startDate)} → ${fmtDateTime(sess.endDate)}`;return <div className="session-block" key={si}><h4>Session {si+1} of {sessionsList.length} · {range} · real {tierLabel(sess.tier)} bars</h4><CandleChart candles={sess.candles} trades={sess.trades} activeIndex={sess.candles.length-1} windowSize={Math.min(sess.candles.length,20)} title={`${selected.symbol} · session ${si+1}`} indicator={indicatorSeries(sess.candles,selected.family,selected.parameters)}/><div className="section-label">EVERY TRADE THIS SESSION MADE</div><div className="trade-table">{sess.trades?.length?sess.trades.map((t,i)=>{const pct=(t.exit-t.entry)/t.entry*100;const entryDate=sess.candles?.[t.entryIndex]?.date;const exitDate=sess.candles?.[t.exitIndex]?.date;const held=entryDate&&exitDate?fmtDuration(new Date(exitDate).getTime()-new Date(entryDate).getTime()):'—';return <div className={`trade-row ${t.pnl>=0?'win':'loss'}`} key={i}><span>#{i+1}</span><span>{fmtDateTime(entryDate)}</span><span>BUY {fmtPrice(t.entry)}</span><span>{fmtDateTime(exitDate)}</span><span>SELL {fmtPrice(t.exit)}</span><span>Held {held}</span><span>{t.pnl>=0?'WIN':'LOSS'}</span><span>{pct>=0?'+':''}{pct.toFixed(2)}%</span><b>{fmtMoney(t.pnl)}</b></div>}):<div className="empty">No trades recorded.</div>}</div></div>})
 })()}
 </section>}
 <section className="panel"><div className="panel-title"><h2>SUCCESSFUL STRATEGY LOG</h2><span className="muted">Saved to Supabase · grouped by run</span></div><div className="metrics"><div><span>Approval rule</span><b>≥45% WR + ≥0.025% return</b></div><div><span>Research capital</span><b>{fmtMoney(balance)}</b></div><div><span>Position mode</span><b>Long only, max 2% risk per trade</b></div><div><span>Market feed</span><b>Live chart</b></div></div>
 {strategies.length>0&&<label className="inline-select run-sort"><span>Sort runs by</span><select value={runSort} onChange={e=>setRunSort(e.target.value as typeof runSort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="qualified">Most successful overall (qualified count)</option><option value="bestScore">Best single strategy score</option></select></label>}
 {strategies.length===0?<div className="empty">No successful strategies saved yet. Run the engine and qualified strategies will appear here.</div>:(()=>{
   const groups:Record<string,Strategy[]>={}
   for(const s of strategies){const key=s.run_id||'ungrouped';(groups[key] ||= []).push(s)}
   let entries=Object.entries(groups).map(([runId,list])=>{
     const run=runs.find(rr=>rr.id===runId)
     const when=run?.started_at||list[0]?.created_at
     const bestScore=Math.max(...list.map(s=>s.score))
     return {runId,run,list:list.slice().sort((a,b)=>b.score-a.score),when,bestScore}
   })
   entries=entries.sort((a,b)=>{
     if(runSort==='newest')return new Date(b.when||0).getTime()-new Date(a.when||0).getTime()
     if(runSort==='oldest')return new Date(a.when||0).getTime()-new Date(b.when||0).getTime()
     if(runSort==='qualified')return b.list.length-a.list.length
     return b.bestScore-a.bestScore
   })
   return <div className="run-groups">{entries.map(g=>{const isOpen=!!expandedRuns[g.runId];return <div className="run-group" key={g.runId}><button className="run-group-header" onClick={()=>setExpandedRuns(prev=>({...prev,[g.runId]:!prev[g.runId]}))}><span className={`chevron ${isOpen?'open':''}`}>▸</span><b>{g.run?`${g.run.symbol} · ${g.run.market}`:g.list[0]?.symbol}</b><span>{fmtDateTime(g.when)}</span><span>{g.list.length} qualified</span>{g.run&&<span>{(g.run.tested_count||g.run.variations_requested).toLocaleString()} tested</span>}{g.run&&<span>{fmtMoney(g.run.starting_balance)} → {fmtMoney(g.run.current_balance)}</span>}<span className={`star ${g.run?.favorite?'on':''}`} onClick={e=>{e.stopPropagation();g.run&&toggleFavoriteRun(g.runId)}}>{g.run?.favorite?'★':'☆'}</span></button>{isOpen&&<div className="table">{g.list.map(s=><button className="row" key={s.id} onClick={()=>setSelected(s)}><div><strong>{s.name}</strong><span>{s.family} · completed {fmtDateTime(s.created_at)}</span><span className="how-it-works">{describeFamily(s.family,s.parameters)}</span></div><span>{s.metrics?.winRate?.toFixed(1)}% WR</span><span>{s.metrics?.returnPct?.toFixed(1)}% return</span><span>{s.metrics?.maxDrawdownPct?.toFixed(1)}% DD</span><span>{s.metrics?.sharpe?.toFixed(2)} Sharpe</span><span>{s.metrics?.trades} trades</span></button>)}</div>}</div>})}</div>
 })()}
 </section>
 <section className="panel"><div className="panel-title"><h2>RESEARCH RUN HISTORY</h2><span className="muted">Click a run for the full outcome</span></div>{runs.length===0?<div className="empty">Your completed research runs will appear here.</div>:(()=>{const renderRun=(r:Run)=><button className="history" key={r.id} onClick={()=>patchRun({selectedRun:selectedRun?.id===r.id?null:r})}><span><b>{r.symbol} · {r.market}</b><small>{new Date(r.started_at).toLocaleString()}</small></span><span>{(r.tested_count||r.variations_requested).toLocaleString()} tested</span><span>{(r.qualified_count||0).toLocaleString()} qualified</span><span>{r.status}</span><span>{r.best_score?.toFixed(1)??'—'} score</span></button>;const rest=runs.slice(5);return <>{runs.slice(0,5).map(renderRun)}{rest.length>0&&<details className="history-more"><summary>Show {rest.length} more run{rest.length>1?'s':''}</summary>{rest.map(renderRun)}</details>}</>})()}{selectedRun&&<div className="run-detail"><h3>{selectedRun.best_strategy_name||'No qualifying strategy'}</h3><p>{selectedRun.summary||selectedRun.failure_reason||'No summary was stored for this run.'}</p>{selectedRun.best_reason&&<p><b>Why the leader passed:</b> {selectedRun.best_reason}</p>}{selectedRun.failure_reason&&<p><b>Why nothing passed:</b> {selectedRun.failure_reason}</p>}</div>}</section>
 </main>
}
