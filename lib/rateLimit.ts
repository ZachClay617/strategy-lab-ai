// Lightweight per-instance rate limiter for API routes. No external store
// (Redis/Upstash) is configured for this project, so this is an in-memory
// fixed-window counter — it protects each individual serverless/edge instance
// from being hammered (and, more importantly, protects the paid/free upstream
// APIs we call — Anthropic, Yahoo Finance — from being abused through our
// routes), but a determined attacker spread across many cold-started
// instances or edge regions can still get more total requests through than
// the nominal limit suggests. It is a real deterrent against scripted abuse
// and runaway loops, not a hard distributed guarantee. If stronger
// enforcement is ever needed, swap this for Vercel KV / Upstash Redis behind
// the same `checkRateLimit` signature.

type Bucket = { count:number; resetAt:number }
const buckets = new Map<string, Bucket>()
let lastSweep = Date.now()

function sweep(now:number){
  if(now-lastSweep<60_000)return
  lastSweep=now
  for(const [key,b] of buckets)if(b.resetAt<=now)buckets.delete(key)
}

export type RateLimitResult = { ok:boolean; limit:number; remaining:number; resetAt:number }

// One bucket per (key, windowMs) — callers can stack a tight per-minute limit
// with a looser per-hour cap on the same identity by calling this twice with
// different suffixes/windows (see checkRateLimit below).
export function rateLimit(key:string, limit:number, windowMs:number):RateLimitResult{
  const now=Date.now()
  sweep(now)
  let b=buckets.get(key)
  if(!b||b.resetAt<=now){
    b={count:0,resetAt:now+windowMs}
    buckets.set(key,b)
  }
  b.count++
  return {ok:b.count<=limit,limit,remaining:Math.max(0,limit-b.count),resetAt:b.resetAt}
}

// Best-effort client IP from the headers Vercel/Next set on every request.
// Not spoof-proof (a client can send its own x-forwarded-for), but Vercel's
// edge network overwrites/appends the real connecting IP as the first entry
// for requests that reach it directly, which covers the normal case this is
// meant to deter (a script hammering the public URL).
export function clientIp(req:{headers:{get(name:string):string|null}}):string{
  const fwd=req.headers.get('x-forwarded-for')
  if(fwd)return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip')||'unknown'
}

// Applies one or more (limit, windowMs) tiers to the same route+identity —
// e.g. a tight per-minute burst limit plus a looser per-hour cost cap for a
// route that calls a paid API. Returns the first tier that's exceeded, if any.
export function checkRateLimit(routeKey:string, id:string, tiers:{limit:number; windowMs:number; label:string}[]):RateLimitResult&{label?:string}{
  let worst:RateLimitResult&{label?:string}=({ok:true,limit:Infinity,remaining:Infinity,resetAt:0})
  for(const t of tiers){
    const r=rateLimit(`${routeKey}:${t.label}:${id}`,t.limit,t.windowMs)
    if(!r.ok)return {...r,label:t.label}
    if(r.remaining<worst.remaining)worst={...r,label:t.label}
  }
  return worst
}

// Framework-agnostic 429 payload — callers do
// `NextResponse.json(body, {status, headers})` with this.
export function rateLimitedPayload(result:RateLimitResult, message?:string){
  const retryAfterSec=Math.max(1,Math.ceil((result.resetAt-Date.now())/1000))
  return {
    body:{error:'rate_limited',message:message||'Too many requests — please slow down and try again shortly.'},
    status:429 as const,
    headers:{'Retry-After':String(retryAfterSec)},
  }
}
