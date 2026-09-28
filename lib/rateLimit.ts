// Rate limiter for API routes. Uses Upstash Redis (a real distributed store —
// shared across every serverless/edge instance, so the limit is an actual
// guarantee, not a per-instance approximation) when the REST URL/token are
// configured, and transparently falls back to an in-memory per-instance
// limiter otherwise so every route keeps working (with the weaker guarantee
// described below) before those env vars are set.
//
// Vercel's own "Upstash"/KV marketplace integration names these
// KV_REST_API_URL/KV_REST_API_TOKEN; a manually-created Upstash database
// instead uses UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN by convention.
// Accept either so this works regardless of how the database was provisioned.
import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'

const redisUrl=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL
const redisToken=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN
const redis=redisUrl&&redisToken?new Redis({url:redisUrl,token:redisToken}):null

export type RateLimitResult = { ok:boolean; limit:number; remaining:number; resetAt:number; label?:string }

// ---------- In-memory fallback (used only when Redis isn't configured) ----------
type Bucket = { count:number; resetAt:number }
const buckets=new Map<string,Bucket>()
let lastSweep=Date.now()
function sweep(now:number){
  if(now-lastSweep<60_000)return
  lastSweep=now
  for(const [key,b] of buckets)if(b.resetAt<=now)buckets.delete(key)
}
function memoryLimit(key:string,limit:number,windowMs:number):Omit<RateLimitResult,'label'>{
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

// ---------- Upstash-backed limiter (one Ratelimit instance per distinct tier shape, cached) ----------
const limiterCache=new Map<string,Ratelimit>()
// Shared across every limiter instance on this warm serverless/edge instance.
// @upstash/ratelimit uses this to remember identities that are ALREADY over
// limit and skip the Redis round-trip entirely on their next request until
// the block expires — real savings specifically during a burst/abuse spike
// (repeated requests from one over-limit caller), which is exactly when
// command volume would otherwise spike fastest. It doesn't reduce the cost
// of normal, under-limit polling, which still needs a real Redis check every
// time to enforce the limit correctly.
const ephemeralCache=new Map<string,number>()
function getLimiter(limit:number,windowMs:number):Ratelimit{
  const cacheKey=`${limit}:${windowMs}`
  let rl=limiterCache.get(cacheKey)
  if(!rl){
    const seconds=Math.max(1,Math.round(windowMs/1000))
    rl=new Ratelimit({redis:redis!,limiter:Ratelimit.slidingWindow(limit,`${seconds} s`),prefix:'ratelimit',analytics:false,ephemeralCache})
    limiterCache.set(cacheKey,rl)
  }
  return rl
}

export function clientIp(req:{headers:{get(name:string):string|null}}):string{
  const fwd=req.headers.get('x-forwarded-for')
  if(fwd)return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip')||'unknown'
}

// Applies one or more (limit, windowMs) tiers to the same route+identity —
// e.g. a tight per-minute burst limit plus a looser per-hour cost cap for a
// route that calls a paid API. Returns the first tier that's exceeded, if any,
// else the tier with the least remaining headroom.
export async function checkRateLimit(routeKey:string, id:string, tiers:{limit:number; windowMs:number; label:string}[]):Promise<RateLimitResult>{
  let worst:RateLimitResult={ok:true,limit:Infinity,remaining:Infinity,resetAt:0}
  for(const t of tiers){
    const key=`${routeKey}:${t.label}:${id}`
    let r:Omit<RateLimitResult,'label'>
    if(redis){
      // Fail open to the in-memory limiter rather than letting a Redis outage
      // or misconfigured credentials 500 every single API route in the app —
      // a degraded (per-instance) rate limit beats no working app at all.
      try{
        const res=await getLimiter(t.limit,t.windowMs).limit(key)
        r={ok:res.success,limit:t.limit,remaining:res.remaining,resetAt:res.reset}
      }catch(e){
        console.error('Redis rate limit check failed, falling back to in-memory',e)
        r=memoryLimit(key,t.limit,t.windowMs)
      }
    } else {
      r=memoryLimit(key,t.limit,t.windowMs)
    }
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
