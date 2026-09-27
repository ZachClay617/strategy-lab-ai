// Centralized research/backtest engine — single source of truth for data
// validation, indicators, execution, metrics, and qualification. Nothing
// outside this file should redefine qualification thresholds, rejection
// categories, or Sharpe math: page.tsx only calls these functions.

export const STARTING_CAPITAL = 100_000
export const FAMILIES = [
  'Trend Following','Mean Reversion','Breakout','Momentum','Volume Confirmation',
  'RSI Regime','Moving Average Cross','MACD Trend','Bollinger Band Reversion',
  'Donchian Breakout','VWAP Pullback','ATR Trend',
] as const
export type Family = typeof FAMILIES[number]

export const SESSION_START_MIN = 9*60, SESSION_END_MIN = 12*60
export const SESSION_RANGE_DAYS = 55
export const RESOLUTION_TIERS = [
  { key:'15m', label:'15-Minute', minutes:15, rangeDays:SESSION_RANGE_DAYS, holdLabel:'must close within the 9:00 AM–12:00 PM ET session' },
  { key:'1h', label:'Hourly', minutes:60, rangeDays:730, holdLabel:'must close within 3 days of opening' },
  { key:'1d', label:'Daily', minutes:1440, rangeDays:3650, holdLabel:'must close within 5 trading days of opening' },
] as const
export type TierKey = typeof RESOLUTION_TIERS[number]['key'] | 'live'
export function maxHoldMsFor(tierKey:TierKey){
  if(tierKey==='1h')return 3*24*60*60*1000
  if(tierKey==='1d')return 5*24*60*60*1000
  return undefined
}
// Bars-per-year used to annualize Sharpe correctly per resolution, instead of
// always assuming daily bars (sqrt(252)). 15m uses the ~3h morning session
// only (12 bars/day); 1h assumes a standard ~6.5h equity session.
const PERIODS_PER_YEAR:Record<TierKey,number> = { '15m':12*252, '1h':Math.round(6.5*252), '1d':252, live:390*252 }
export function periodsPerYearFor(tierKey:TierKey){ return PERIODS_PER_YEAR[tierKey]||252 }
export function tierLabel(key?:string){
  if(key==='live')return 'live 1-minute'
  const t=RESOLUTION_TIERS.find(x=>x.key===key)
  return t?`${t.label} (${t.holdLabel})`:key||'unknown'
}

export type Candle = { date:string; open:number; high:number; low:number; close:number; volume:number }
export type Trade = { side:'LONG'; entryIndex:number; exitIndex:number; entry:number; exit:number; qty:number; pnl:number; fee:number; reason:string }
export type DataSource = 'yahoo'|'synthetic'

export type Metrics = {
  returnPct:number; winRate:number; maxDrawdownPct:number; sharpe:number; trades:number; wins:number; losses:number
  profit:number; profitFactor:number; expectancy:number; avgWin:number; avgLoss:number; grossProfit:number; grossLoss:number
  score:number; dataSource:DataSource; barCount:number; startDate?:string; endDate?:string
}

export function clamp(n:number,a:number,b:number){return Math.max(a,Math.min(b,n))}
export function seeded(seed:number){let x=seed|0;return()=>{x=(x*1664525+1013904223)|0;return(x>>>0)/4294967296}}

// ---------- Data validation ----------
const MIN_BARS:Record<string,number> = { '15m':60, '1h':150, '1d':250 }
const GAP_CAP_MULTIPLIER:Record<string,number> = { '15m':6, '1h':12, '1d':8 }
export type DatasetValidation = { ok:boolean; reason?:string; barCount:number }
export function validateDataset(candles:Candle[]|null|undefined, tierKey:'15m'|'1h'|'1d'):DatasetValidation{
  const list=candles||[]
  const minBars=MIN_BARS[tierKey]
  if(list.length<minBars)return {ok:false,reason:`Only ${list.length} real bars were returned (minimum ${minBars} required for ${tierKey} bars).`,barCount:list.length}
  let prevT=-Infinity; const times:number[]=[]
  for(const c of list){
    const t=new Date(c.date).getTime()
    if(!Number.isFinite(t)||!Number.isFinite(c.open)||!Number.isFinite(c.high)||!Number.isFinite(c.low)||!Number.isFinite(c.close)||c.high<c.low||c.low<=0||c.close<=0)
      return {ok:false,reason:'Malformed bar detected (invalid price or timestamp).',barCount:list.length}
    if(t<=prevT)return {ok:false,reason:'Data is not strictly chronological or contains duplicate timestamps.',barCount:list.length}
    prevT=t;times.push(t)
  }
  const diffs=times.slice(1).map((t,i)=>t-times[i])
  const sorted=[...diffs].sort((a,b)=>a-b)
  const median=sorted[Math.floor(sorted.length/2)]||1
  const cap=GAP_CAP_MULTIPLIER[tierKey]
  const flagged=diffs.filter(d=>d>median*cap).length
  if(diffs.length&&flagged/diffs.length>0.08)return {ok:false,reason:'Data contains more gaps than the expected market schedule allows for this bar size.',barCount:list.length}
  return {ok:true,barCount:list.length}
}

// ---------- Indicators (real, standard definitions) ----------
export function sma(values:number[], i:number, period:number){const from=Math.max(0,i-period+1);const w=values.slice(from,i+1);return w.length?w.reduce((a,b)=>a+b,0)/w.length:values[i]}
export function smaSeries(values:number[], period:number):(number|null)[]{
  const out:(number|null)[]=new Array(values.length).fill(null)
  for(let i=0;i<values.length;i++)out[i]=i<period-1?null:sma(values,i,period)
  return out
}
export function emaSeries(values:number[], period:number):(number|null)[]{
  const out:(number|null)[]=new Array(values.length).fill(null)
  const k=2/(period+1); let prev:number|null=null
  for(let i=0;i<values.length;i++){
    if(i<period-1){out[i]=null;continue}
    if(prev==null)prev=values.slice(i-period+1,i+1).reduce((a,b)=>a+b,0)/period
    else prev=values[i]*k+prev*(1-k)
    out[i]=prev
  }
  return out
}
// Standard Wilder RSI(period) — replaces the previous single-bar "rsiLike" approximation.
export function wilderRSISeries(closes:number[], period=14):(number|null)[]{
  const n=closes.length; const out:(number|null)[]=new Array(n).fill(null)
  if(n<period+1)return out
  let gainSum=0,lossSum=0
  for(let i=1;i<=period;i++){const d=closes[i]-closes[i-1];if(d>0)gainSum+=d;else lossSum-=d}
  let avgGain=gainSum/period, avgLoss=lossSum/period
  out[period]=avgLoss===0?100:100-100/(1+avgGain/avgLoss)
  for(let i=period+1;i<n;i++){
    const d=closes[i]-closes[i-1];const gain=d>0?d:0;const loss=d<0?-d:0
    avgGain=(avgGain*(period-1)+gain)/period
    avgLoss=(avgLoss*(period-1)+loss)/period
    out[i]=avgLoss===0?100:100-100/(1+avgGain/avgLoss)
  }
  return out
}
export function atrSeries(data:Candle[], period=14):(number|null)[]{
  const n=data.length; const tr:number[]=new Array(n).fill(0)
  for(let i=0;i<n;i++){
    const prevClose=i>0?data[i-1].close:data[i].close
    tr[i]=Math.max(data[i].high-data[i].low,Math.abs(data[i].high-prevClose),Math.abs(data[i].low-prevClose))
  }
  const out:(number|null)[]=new Array(n).fill(null)
  if(n<period)return out
  let avg=tr.slice(1,period+1).reduce((a,b)=>a+b,0)/period
  out[period]=avg
  for(let i=period+1;i<n;i++){avg=(avg*(period-1)+tr[i])/period;out[i]=avg}
  return out
}
export function donchian(data:Candle[], i:number, lookback:number){
  const from=Math.max(0,i-lookback)
  const w=data.slice(from,i)
  if(!w.length)return {hi:data[i].high,lo:data[i].low}
  return {hi:Math.max(...w.map(x=>x.high)),lo:Math.min(...w.map(x=>x.low))}
}
// Session-resetting VWAP (typical price weighted by volume, reset each calendar day).
export function vwapSeries(data:Candle[]):number[]{
  const out:number[]=new Array(data.length).fill(0)
  let dayKey='', cumPV=0, cumV=0
  for(let i=0;i<data.length;i++){
    const dk=new Date(data[i].date).toISOString().slice(0,10)
    if(dk!==dayKey){dayKey=dk;cumPV=0;cumV=0}
    const typical=(data[i].high+data[i].low+data[i].close)/3
    cumPV+=typical*data[i].volume; cumV+=data[i].volume
    out[i]=cumV>0?cumPV/cumV:typical
  }
  return out
}

type IndicatorCtx = {
  closes:number[]; smaFast:(number|null)[]; smaSlow:(number|null)[]; rsi:(number|null)[]
  emaFastMacd:(number|null)[]; emaSlowMacd:(number|null)[]; macdLine:(number|null)[]; macdSignal:(number|null)[]
  bbMid:(number|null)[]; bbUpper:(number|null)[]; bbLower:(number|null)[]; atr:(number|null)[]; vwap:number[]
}
export function computeIndicatorContext(data:Candle[], p:any):IndicatorCtx{
  const closes=data.map(c=>c.close)
  const smaFast=smaSeries(closes,p.fast)
  const smaSlow=smaSeries(closes,p.slow)
  const rsi=wilderRSISeries(closes,14)
  const emaFastMacd=emaSeries(closes,12)
  const emaSlowMacd=emaSeries(closes,26)
  const macdLineRaw=closes.map((_,i)=>(emaFastMacd[i]!=null&&emaSlowMacd[i]!=null)?(emaFastMacd[i] as number)-(emaSlowMacd[i] as number):null)
  const macdValues=macdLineRaw.map(v=>v??0)
  const macdSignalRaw=emaSeries(macdValues,9)
  const macdLine=macdLineRaw.map((v,i)=>v==null?null:v)
  const macdSignal=macdSignalRaw.map((v,i)=>macdLineRaw[i]==null?null:v)
  const bbPeriod=Math.max(5,Math.min(60,p.fast))
  const bbMid=smaSeries(closes,bbPeriod)
  const bbUpper:(number|null)[]=new Array(closes.length).fill(null)
  const bbLower:(number|null)[]=new Array(closes.length).fill(null)
  for(let i=0;i<closes.length;i++){
    if(bbMid[i]==null)continue
    const from=Math.max(0,i-bbPeriod+1); const w=closes.slice(from,i+1)
    const mean=bbMid[i] as number
    const sd=Math.sqrt(w.reduce((a,x)=>a+(x-mean)**2,0)/w.length)
    const mult=p.bbMult||2
    bbUpper[i]=mean+mult*sd; bbLower[i]=mean-mult*sd
  }
  const atr=atrSeries(data,Math.max(5,Math.min(30,Math.round(p.atrPeriod||14))))
  const vwap=vwapSeries(data)
  return {closes,smaFast,smaSlow,rsi,emaFastMacd,emaSlowMacd,macdLine,macdSignal,bbMid,bbUpper,bbLower,atr,vwap}
}

export function signalForFamily(ctx:IndicatorCtx, data:Candle[], i:number, family:string, p:any):{long:boolean;sell:boolean}{
  const c=ctx.closes[i], prev=ctx.closes[i-1]??c
  const fast=ctx.smaFast[i]??c, slow=ctx.smaSlow[i]??c, rsi=ctx.rsi[i]
  let long=false,sell=false
  if(family==='Trend Following'){long=c>fast*(1+p.threshold);sell=c<fast*(1-p.threshold)}
  else if(family==='Mean Reversion'){if(rsi==null)return {long:false,sell:false};long=rsi<p.rsi;sell=rsi>100-p.rsi}
  else if(family==='Breakout'){const win=ctx.closes.slice(Math.max(0,i-p.lookback),i);const hiC=win.length?Math.max(...win):c;const loC=win.length?Math.min(...win):c;long=c>=hiC*(1+p.threshold);sell=c<=loC*(1-p.threshold)}
  else if(family==='Momentum'){long=c>prev*(1+p.threshold);sell=c<prev*(1-p.threshold)}
  else if(family==='Volume Confirmation'){const from=Math.max(0,i-p.fast);const vols=data.slice(from,i).map(x=>x.volume);const avgv=vols.length?vols.reduce((a,b)=>a+b,0)/vols.length:data[i].volume;long=c>fast&&data[i].volume>avgv*(1+p.vol);sell=c<fast}
  else if(family==='RSI Regime'){if(rsi==null)return {long:false,sell:false};long=rsi<p.rsi&&c>fast;sell=rsi>100-p.rsi||c<fast*(1-p.threshold)}
  else if(family==='Moving Average Cross'){long=fast>slow*(1+p.threshold);sell=fast<slow*(1-p.threshold)}
  else if(family==='MACD Trend'){const line=ctx.macdLine[i],sig=ctx.macdSignal[i];if(line==null||sig==null)return {long:false,sell:false};const prevLine=ctx.macdLine[i-1],prevSig=ctx.macdSignal[i-1];const crossUp=prevLine!=null&&prevSig!=null&&prevLine<=prevSig&&line>sig;const crossDown=prevLine!=null&&prevSig!=null&&prevLine>=prevSig&&line<sig;long=crossUp;sell=crossDown}
  else if(family==='Bollinger Band Reversion'){const lo=ctx.bbLower[i],hi=ctx.bbUpper[i],mid=ctx.bbMid[i];if(lo==null||hi==null||mid==null)return {long:false,sell:false};long=c<=lo;sell=c>=mid}
  else if(family==='Donchian Breakout'){const from=Math.max(0,i-p.lookback);const w=data.slice(from,i);const hi=w.length?Math.max(...w.map(x=>x.high)):data[i].high;const lo=w.length?Math.min(...w.map(x=>x.low)):data[i].low;long=data[i].close>=hi;sell=data[i].close<=lo}
  else if(family==='VWAP Pullback'){const vwap=ctx.vwap[i],prevVwap=ctx.vwap[i-1]??vwap,prevC=prev;long=prevC<prevVwap*(1-p.threshold)&&c>=vwap*(1-p.threshold*.3);sell=c<vwap*(1-p.threshold)}
  else if(family==='ATR Trend'){const atr=ctx.atr[i];if(atr==null)return {long:false,sell:false};const mult=p.atrMult||1.5;long=c>fast+atr*mult*.15&&c>prev;sell=c<fast-atr*mult}
  return {long,sell}
}

export function describeFamily(family:string, p:any){
  const pct=(n:number)=>`${(n*100).toFixed(2)}%`
  if(family==='Trend Following')return `Trend Following buys when price closes more than ${pct(p.threshold)} above its ${p.fast}-period simple moving average, and sells once price falls more than ${pct(p.threshold)} below that same average. Indicator: ${p.fast}-period SMA.`
  if(family==='Mean Reversion')return `Mean Reversion buys when Wilder's RSI(14) drops below ${p.rsi}, betting on a bounce back toward the average, and sells once RSI climbs back above ${100-p.rsi}. Indicator: Wilder RSI(14).`
  if(family==='Breakout')return `Breakout buys when the close breaks above the highest close of the last ${p.lookback} candles by more than ${pct(p.threshold)}, and sells when price breaks back below the recent low band. Indicator: ${p.lookback}-candle rolling high/low of closes.`
  if(family==='Momentum')return `Momentum buys when price rises more than ${pct(p.threshold)} versus the previous candle, and sells when price falls more than ${pct(p.threshold)} versus the previous candle. Indicator: single-candle rate of change.`
  if(family==='Volume Confirmation')return `Volume Confirmation buys when price is above its ${p.fast}-period SMA AND volume is running ${pct(p.vol)} above its ${p.fast}-period average volume, and sells when price falls back below that average. Indicators: ${p.fast}-period price SMA and ${p.fast}-period volume SMA.`
  if(family==='RSI Regime')return `RSI Regime buys when Wilder RSI(14) is below ${p.rsi} while price is still above its ${p.fast}-period SMA (a pullback inside an uptrend), and sells when RSI climbs above ${100-p.rsi} or price breaks the SMA by ${pct(p.threshold)}. Indicators: Wilder RSI(14) and ${p.fast}-period SMA.`
  if(family==='Moving Average Cross')return `Moving Average Cross buys when the ${p.fast}-period SMA crosses more than ${pct(p.threshold)} above the ${p.slow}-period SMA, and sells when it crosses back below. Indicators: ${p.fast}-period and ${p.slow}-period SMA.`
  if(family==='MACD Trend')return `MACD Trend buys on a MACD line crossing above its 9-period signal line, and sells on a cross back below. Indicators: MACD(12,26) line and 9-period signal EMA.`
  if(family==='Bollinger Band Reversion')return `Bollinger Band Reversion buys when price touches or closes below the lower Bollinger Band (${p.bbMult?.toFixed?.(2)||2}σ, ${Math.max(5,Math.min(60,p.fast))}-period), betting on reversion to the middle band, and sells once price reaches the middle band. Indicator: Bollinger Bands.`
  if(family==='Donchian Breakout')return `Donchian Breakout buys when price closes at a new ${p.lookback}-candle high (of the high/low range, not just closes), and sells on a new ${p.lookback}-candle low. Indicator: ${p.lookback}-period Donchian channel.`
  if(family==='VWAP Pullback')return `VWAP Pullback buys when price dips below the session VWAP and recovers back toward it, and sells when price breaks meaningfully below VWAP. Indicator: session-resetting Volume-Weighted Average Price.`
  if(family==='ATR Trend')return `ATR Trend buys when price pushes above its ${p.fast}-period SMA by more than its Average True Range (volatility-scaled breakout), and sells when price falls back below the SMA by a full ATR. Indicators: ${p.fast}-period SMA and Wilder ATR.`
  return 'Custom rule set.'
}

// ---------- Execution / backtest ----------
export type ExecutionAssumptions = { slippageBps:number; feeBps:number; model:'next-bar-open' }
export const EXECUTION:ExecutionAssumptions = { slippageBps:5, feeBps:2, model:'next-bar-open' }

export function backtestSession(data:Candle[], family:string, p:any, opts:{maxHoldMs?:number; startingCash?:number; tierKey:TierKey; dataSource:DataSource}){
  const startingCash=opts.startingCash??STARTING_CAPITAL
  const ctx=computeIndicatorContext(data,p)
  let cash=startingCash, qty=0, side:'LONG'|null=null, entry=0, entryIndex=0, wins=0, losses=0, trades=0
  let peak=cash, maxDD=0, grossProfit=0, grossLoss=0
  const equity:number[]=[]; const tradeLog:Trade[]=[]
  const riskFraction=.02
  const warmup=Math.max(4,p.slow||0,p.lookback||0,26)
  // Reserve the final bar so every signal has a next bar to execute on (no look-ahead: decide with data<=i, fill at i+1).
  for(let i=warmup;i<data.length-1;i++){
    const sig=signalForFamily(ctx,data,i,family,p)
    const heldTooLong=side==='LONG'&&opts.maxHoldMs!=null&&(new Date(data[i].date).getTime()-new Date(data[entryIndex].date).getTime())>=opts.maxHoldMs
    if(side===null&&sig.long){
      const fillIdx=i+1
      const fillPrice=data[fillIdx].open*(1+EXECUTION.slippageBps/10000)
      const notional=cash*riskFraction
      const fee=notional*(EXECUTION.feeBps/10000)
      qty=(notional-fee)/Math.max(fillPrice,1e-6)
      side='LONG';entry=fillPrice;entryIndex=fillIdx;cash-=fee
    } else if(side==='LONG'&&(sig.sell||heldTooLong)){
      const fillIdx=i+1
      const fillPrice=data[fillIdx].open*(1-EXECUTION.slippageBps/10000)
      const gross=(fillPrice-entry)*qty
      const fee=(fillPrice*qty)*(EXECUTION.feeBps/10000)
      const pnl=gross-fee
      cash+=pnl
      const win=pnl>=0;if(win){wins++;grossProfit+=pnl}else{losses++;grossLoss+=-pnl}
      trades++
      tradeLog.push({side,entryIndex,exitIndex:fillIdx,entry,exit:fillPrice,qty,pnl,fee,reason:heldTooLong&&!sig.sell?'Maximum hold time reached for this bar size; position closed automatically.':'Sell signal closed the position.'})
      side=null;qty=0
    }
    const mark=side==='LONG'?cash+((data[i].close-entry)*qty):cash
    peak=Math.max(peak,mark);maxDD=Math.max(maxDD,(peak-mark)/Math.max(peak,1));equity.push(mark)
  }
  if(side){
    const fillPrice=data[data.length-1].close*(1-EXECUTION.slippageBps/10000)
    const gross=(fillPrice-entry)*qty
    const fee=(fillPrice*qty)*(EXECUTION.feeBps/10000)
    const pnl=gross-fee
    cash+=pnl
    const win=pnl>=0;if(win){wins++;grossProfit+=pnl}else{losses++;grossLoss+=-pnl}
    trades++
    tradeLog.push({side,entryIndex,exitIndex:data.length-1,entry,exit:fillPrice,qty,pnl,fee,reason:'End-of-test liquidation (no further bar available for a next-bar exit).'})
  }
  const profit=cash-startingCash
  const returnPct=profit/startingCash*100 // always derived from profit, never computed independently
  const winRate=trades?wins/trades*100:0
  const perBarReturns:number[]=[];for(let i=1;i<equity.length;i++)perBarReturns.push((equity[i]-equity[i-1])/Math.max(Math.abs(equity[i-1]),1))
  const mean=perBarReturns.reduce((a,b)=>a+b,0)/(perBarReturns.length||1)
  const sd=Math.sqrt(perBarReturns.reduce((a,b)=>a+(b-mean)**2,0)/(perBarReturns.length||1))||0
  const periodsPerYear=periodsPerYearFor(opts.tierKey)
  const sharpeRaw=sd>0?mean/sd*Math.sqrt(periodsPerYear):0
  const sharpe=Number.isFinite(sharpeRaw)?sharpeRaw:0
  const profitFactor=grossLoss>0?grossProfit/grossLoss:(grossProfit>0?Infinity:0)
  const expectancy=trades?(grossProfit-grossLoss)/trades:0
  const avgWin=wins?grossProfit/wins:0
  const avgLoss=losses?grossLoss/losses:0
  const score=clamp(sharpe*10*.35+returnPct*.2+winRate*.15-(maxDD*100)*.3,-100,100)
  const metrics:Metrics={returnPct,winRate,maxDrawdownPct:maxDD*100,sharpe,trades,wins,losses,profit,profitFactor,expectancy,avgWin,avgLoss,grossProfit,grossLoss,score,dataSource:opts.dataSource,barCount:data.length,startDate:data[0]?.date,endDate:data[data.length-1]?.date}
  return {metrics,equity,trades:tradeLog,endingBalance:cash}
}

// Hard, mechanical sanity checks. If any fails the candidate is rejected before qualification logic even runs.
export function hardSafetyCheck(m:Metrics, tradeLog:{entryIndex:number;exitIndex:number;entry:number;exit:number;pnl:number}[]):{ok:boolean;reason?:string}{
  const maxPossibleTrades=Math.floor(m.barCount/2)
  if(m.trades>maxPossibleTrades)return {ok:false,reason:`Impossible trade count: ${m.trades} trades reported on only ${m.barCount} bars (max possible ${maxPossibleTrades}).`}
  if(m.wins+m.losses!==m.trades)return {ok:false,reason:'Win/loss counts do not add up to total trades.'}
  if(m.maxDrawdownPct<0)return {ok:false,reason:'Negative drawdown is not possible.'}
  if(!Number.isFinite(m.sharpe))return {ok:false,reason:'Sharpe ratio is not finite.'}
  if(!Number.isFinite(m.profit)||!Number.isFinite(m.returnPct))return {ok:false,reason:'Profit or return produced NaN/Infinity.'}
  if((m.profit>0&&m.returnPct<0)||(m.profit<0&&m.returnPct>0))return {ok:false,reason:'Profit and return percentage disagree in sign.'}
  const seen=new Set<number>()
  for(const t of tradeLog){
    if(t.entryIndex>=t.exitIndex)return {ok:false,reason:'A trade has an exit at or before its entry.'}
    if(seen.has(t.entryIndex))return {ok:false,reason:'Duplicate trade entry detected on the same bar.'}
    seen.add(t.entryIndex)
    if(!Number.isFinite(t.entry)||!Number.isFinite(t.exit)||!Number.isFinite(t.pnl))return {ok:false,reason:'A trade contains NaN/Infinity values.'}
  }
  if(!m.startDate||!m.endDate||!Number.isFinite(new Date(m.startDate).getTime())||!Number.isFinite(new Date(m.endDate).getTime()))return {ok:false,reason:'Invalid test period timestamps.'}
  if(m.dataSource!=='yahoo')return {ok:false,reason:'Synthetic data cannot qualify.'}
  return {ok:true}
}

// ---------- Aggregation across independent parallel trials (sessions/folds) ----------
// Each session is an independent trial starting from the same capital snapshot, not a
// sequentially compounding sequence — so dollar profit must be averaged across trials,
// never summed, or a strategy tested across many sessions would report a profit far
// larger than its (correctly averaged) return percentage implies.
export function combineMetrics(list:Metrics[], startingCash:number):Metrics{
  if(!list.length)return {returnPct:0,winRate:0,maxDrawdownPct:0,sharpe:0,trades:0,wins:0,losses:0,profit:0,profitFactor:0,expectancy:0,avgWin:0,avgLoss:0,grossProfit:0,grossLoss:0,score:0,dataSource:'yahoo',barCount:0}
  const trades=list.reduce((s,m)=>s+m.trades,0)
  const wins=list.reduce((s,m)=>s+m.wins,0)
  const losses=list.reduce((s,m)=>s+m.losses,0)
  const grossProfit=list.reduce((s,m)=>s+m.grossProfit,0)
  const grossLoss=list.reduce((s,m)=>s+m.grossLoss,0)
  const meanProfit=list.reduce((s,m)=>s+m.profit,0)/list.length
  const returnPct=meanProfit/startingCash*100
  const winRate=trades?wins/trades*100:0
  const maxDrawdownPct=Math.max(...list.map(m=>m.maxDrawdownPct))
  const sharpe=list.reduce((s,m)=>s+m.sharpe,0)/list.length
  const profitFactor=grossLoss>0?grossProfit/grossLoss:(grossProfit>0?Infinity:0)
  const expectancy=trades?(grossProfit-grossLoss)/trades:0
  const avgWin=wins?grossProfit/wins:0
  const avgLoss=losses?grossLoss/losses:0
  const barCount=list.reduce((s,m)=>s+m.barCount,0)
  const dataSource:DataSource=list.every(m=>m.dataSource==='yahoo')?'yahoo':'synthetic'
  const score=clamp(sharpe*10*.35+returnPct*.2+winRate*.15-maxDrawdownPct*.3,-100,100)
  return {returnPct,winRate,maxDrawdownPct,sharpe,trades,wins,losses,profit:meanProfit,profitFactor,expectancy,avgWin,avgLoss,grossProfit,grossLoss,score,dataSource,barCount}
}

// ---------- Qualification: the ONE place thresholds live ----------
export type QualificationResult = { passed:boolean; category:string; reason:string }
export function evaluateQualification(input:{
  dataSource:DataSource
  inSample:Metrics
  outOfSample:Metrics
  folds:Metrics[]
  hardCheck:{ok:boolean;reason?:string}
}):QualificationResult{
  const {dataSource,inSample,outOfSample,folds,hardCheck}=input
  if(!hardCheck.ok)return {passed:false,category:'Failed a data-integrity check',reason:hardCheck.reason||'Failed a hard safety check.'}
  if(dataSource!=='yahoo')return {passed:false,category:'Synthetic data',reason:'This test ran on simulated (non-real) data and can never qualify.'}
  const totalTrades=inSample.trades+outOfSample.trades
  if(totalTrades<50)return {passed:false,category:'Fewer than 50 total trades',reason:`Only ${totalTrades} completed trades across all validation data (minimum 50 required).`}
  if(outOfSample.trades<20)return {passed:false,category:'Fewer than 20 out-of-sample trades',reason:`Only ${outOfSample.trades} completed trades in the unseen out-of-sample portion (minimum 20 required).`}
  if(outOfSample.expectancy<=0)return {passed:false,category:'Non-positive expectancy',reason:`Out-of-sample expectancy is $${outOfSample.expectancy.toFixed(2)} per trade, which is not positive.`}
  if(outOfSample.profitFactor<1.15)return {passed:false,category:'Profit factor below 1.15',reason:`Out-of-sample profit factor is ${Number.isFinite(outOfSample.profitFactor)?outOfSample.profitFactor.toFixed(2):'∞'}, below the required 1.15.`}
  if(outOfSample.sharpe<0.75)return {passed:false,category:'Out-of-sample Sharpe below 0.75',reason:`Out-of-sample Sharpe is ${outOfSample.sharpe.toFixed(2)}, below the required 0.75.`}
  if(outOfSample.returnPct<=0)return {passed:false,category:'Out-of-sample return not positive',reason:`Out-of-sample return is ${outOfSample.returnPct.toFixed(3)}%, which is not positive.`}
  if(outOfSample.maxDrawdownPct>10)return {passed:false,category:'Drawdown above 10%',reason:`Drawdown reached ${outOfSample.maxDrawdownPct.toFixed(1)}%, above the required 10% max.`}
  if(folds.length>1){
    const positiveWindows=folds.filter(f=>f.profit>0).length
    const positiveFrac=positiveWindows/folds.length
    if(positiveFrac<0.6)return {passed:false,category:'Inconsistent across validation windows',reason:`Only ${positiveWindows} of ${folds.length} validation windows were profitable (minimum 60% required).`}
    const totalProfit=folds.reduce((s,f)=>s+Math.max(f.profit,0),0)
    if(totalProfit>0){
      const maxShare=Math.max(...folds.map(f=>Math.max(f.profit,0)))/totalProfit
      if(maxShare>0.6)return {passed:false,category:'Profit concentrated in one window',reason:`One validation window accounts for ${(maxShare*100).toFixed(0)}% of total profit (maximum 60% allowed) — the result is not consistent.`}
    }
  }
  return {passed:true,category:'Qualified',reason:`Qualified: ${outOfSample.wins} wins / ${outOfSample.losses} losses out-of-sample, ${outOfSample.returnPct.toFixed(2)}% OOS return, ${outOfSample.maxDrawdownPct.toFixed(1)}% max drawdown, ${outOfSample.sharpe.toFixed(2)} OOS Sharpe, ${Number.isFinite(outOfSample.profitFactor)?outOfSample.profitFactor.toFixed(2):'∞'} profit factor.`}
}

// Composite ranking for saved/qualified strategies — Sharpe and drawdown lead,
// win rate never dominates (unlike the old score formula, which weighted it directly).
export function rankScore(outOfSample:Metrics, folds:Metrics[]):number{
  const consistency=folds.length?folds.filter(f=>f.profit>0).length/folds.length:1
  const tradeCountScore=clamp(1-Math.abs(Math.log10(Math.max(outOfSample.trades,1)/40)),0,1) // rewards a "reasonable" trade count, not extremes
  const pf=Number.isFinite(outOfSample.profitFactor)?Math.min(outOfSample.profitFactor,5):5
  return outOfSample.sharpe*40 - outOfSample.maxDrawdownPct*2 + outOfSample.returnPct*3 + consistency*20 + pf*8 + tradeCountScore*10
}

// Buckets near-duplicate parameter sets together so hundreds of nearly identical
// variants don't flood the saved results — only the strongest per bucket is kept.
export function dedupeKey(family:string, p:any):string{
  const round=(v:number,step:number)=>Math.round((v||0)/step)*step
  return [family,round(p.fast,5),round(p.slow,10),round(p.lookback,5),round(p.threshold,.002),round(p.rsi,5),round(p.bbMult||0,.3),round(p.atrMult||0,.3)].join('|')
}

// Rejects parameter sets outside sensible bounds or structurally invalid (e.g. fast >= slow).
export function paramsPlausible(family:string, p:any):boolean{
  if(p.fast<2||p.fast>200||p.slow<3||p.slow>400)return false
  if(family==='Moving Average Cross'&&p.fast>=p.slow)return false
  if(p.threshold<0||p.threshold>0.15)return false
  if(p.rsi<5||p.rsi>45)return false
  if(p.lookback<3||p.lookback>300)return false
  return true
}

export function randomParams(r:()=>number):any{
  return {
    fast:Math.floor(5+r()*55),
    slow:Math.floor(30+r()*120),
    lookback:Math.floor(10+r()*80),
    threshold:.001+r()*.03,
    rsi:25+Math.floor(r()*15),
    vol:r()*.8,
    bbMult:1.5+r()*1.5,
    atrPeriod:7+Math.floor(r()*20),
    atrMult:0.5+r()*2.5,
  }
}

export function clampParamsToSession(p:any, len:number){
  const cap=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v))
  return {...p,
    fast:Math.round(cap(p.fast,2,Math.max(2,Math.floor(len*.35)))),
    slow:Math.round(cap(p.slow,3,Math.max(3,Math.floor(len*.6)))),
    lookback:Math.round(cap(p.lookback,2,Math.max(2,Math.floor(len*.5)))),
  }
}

// ---------- Chronological in-sample / out-of-sample splitting ----------
export function splitChronological<T>(list:T[], inSampleFraction=0.7):{inSample:T[]; outOfSample:T[]}{
  const cut=Math.floor(list.length*inSampleFraction)
  return {inSample:list.slice(0,cut), outOfSample:list.slice(cut)}
}
// Chronological walk-forward folds within a (typically out-of-sample) slice, so a
// qualifying strategy is checked across multiple distinct periods, not one lucky window.
export function makeWalkForwardFolds<T>(list:T[], minPerFold:number, maxFolds=3):T[][]{
  if(list.length<minPerFold*2)return list.length?[list]:[]
  const folds=Math.min(maxFolds,Math.floor(list.length/minPerFold))
  const size=Math.floor(list.length/folds)
  const out:T[][]=[]
  for(let i=0;i<folds;i++)out.push(list.slice(i*size, i===folds-1?list.length:(i+1)*size))
  return out
}
