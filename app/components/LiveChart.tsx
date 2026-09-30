'use client'
import type { Candle } from '@/lib/market'

function fmtPrice(n:number){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n)}
function fmtClock(iso:string){return new Date(iso).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}
function fmtDate(iso:string){return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric'})}

export type ChartMarker = { index:number; type:'buy'|'sell'; price:number }

export default function LiveChart({candles,windowSize=60,markers=[],title}:{candles:Candle[];windowSize?:number;markers?:ChartMarker[];title:string}){
  if(!candles.length)return <div className="chart empty">Waiting for market data…</div>
  const visible=candles.slice(Math.max(0,candles.length-windowSize))
  const offset=candles.length-visible.length
  const up=visible[visible.length-1]?.close>=visible[0]?.open
  const w=1000,h=460,padL=64,padR=16,padT=20,padB=34
  const min=Math.min(...visible.map(x=>x.low)),max=Math.max(...visible.map(x=>x.high))
  const spread=max-min||1,pricePad=spread*.1,adjMin=min-pricePad,adjMax=max+pricePad,range=adjMax-adjMin||1
  const x=(i:number)=>padL+(i/(Math.max(visible.length-1,1)))*(w-padL-padR)
  const y=(v:number)=>h-padB-((v-adjMin)/range)*(h-padT-padB)
  const gridLines=4
  const bodyWidth=Math.max(2,Math.min(18,(w-padL-padR)/visible.length*.58))
  const isDailyish=visible.length>1&&(new Date(visible[1].date).getTime()-new Date(visible[0].date).getTime())>=20*3600*1000
  const timeTickCount=Math.min(visible.length,6)
  const timeTicks=Array.from({length:timeTickCount}).map((_,k)=>{
    const i=Math.round(k*(visible.length-1)/Math.max(1,timeTickCount-1))
    return {i,label:visible[i]?(isDailyish?fmtDate(visible[i].date):fmtClock(visible[i].date)):''}
  })
  const lastClose=visible[visible.length-1]?.close||0
  const visibleMarkers=markers.filter(m=>m.index-offset>=0&&m.index-offset<visible.length)
  return <div className="chart-wrap rh">
    <div className="chart-head"><div><b>{title}</b><span>LIVE MARKET DATA</span></div><strong className={up?'up':'down'}>{fmtPrice(lastClose)}</strong></div>
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`${title} — live price chart with signal markers`}>
      {Array.from({length:gridLines}).map((_,i)=>{const v=adjMin+(range*i)/(gridLines-1);const yy=y(v);return <g key={i}><line x1={padL} x2={w-padR} y1={yy} y2={yy} stroke="#ffffff" strokeOpacity=".06" strokeWidth="1"/><text x={padL-8} y={yy+4} fill="#6b7690" fontSize="11" textAnchor="end">{fmtPrice(v)}</text></g>})}
      {visible.map((c,i)=>{const rise=c.close>=c.open;const cx=x(i),bodyTop=y(Math.max(c.open,c.close)),bodyBottom=y(Math.min(c.open,c.close));const color=rise?'#00c805':'#ff5000';return <g key={c.date}><title>{`${c.date}\nOpen ${fmtPrice(c.open)} · High ${fmtPrice(c.high)} · Low ${fmtPrice(c.low)} · Close ${fmtPrice(c.close)}`}</title><line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth="1.4"/><rect x={cx-bodyWidth/2} y={bodyTop} width={bodyWidth} height={Math.max(2,bodyBottom-bodyTop)} fill={color} rx="1.5"/></g>})}
      {visibleMarkers.map((m,i)=>{const ix=m.index-offset;const yy=y(m.price);const color=m.type==='buy'?'#57e8ff':'#ff9b70';return <g key={i}><circle cx={x(ix)} cy={yy} r="5.5" fill={color} stroke="#05070d" strokeWidth="1.5"/><text x={x(ix)+7} y={yy-7} fill={color} fontSize="11" fontWeight="800">{m.type.toUpperCase()}</text></g>})}
      {timeTicks.map((t,k)=><text key={k} x={x(t.i)} y={h-10} fill="#6b7690" fontSize="11" textAnchor="middle">{t.label}</text>)}
    </svg>
  </div>
}
