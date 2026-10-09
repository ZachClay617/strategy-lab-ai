#!/usr/bin/env node
// Live health check for the production site. Run with `npm run check:site`;
// .github/workflows/site-health.yml runs it on a schedule so a failure emails
// the repo owner.
//
// Covers the two ways the site has failed to load for visitors:
//   - www.strategylabai.net had no SSL certificate (www wasn't added to the
//     Vercel project), so browsers refused to open it. Because the site sends
//     HSTS with includeSubDomains, there's no "proceed anyway" — it just fails.
//   - a page that sits loading forever instead of answering.
// So every request here has a hard time limit, and both hostnames' certificates
// are checked for validity and upcoming expiry.

import tls from 'node:tls'

const APEX = 'strategylabai.net'
const WWW = `www.${APEX}`
const ORIGIN = `https://${APEX}`
const TIMEOUT_MS = 15_000
const MIN_CERT_DAYS = 14
const RETRY_DELAY_MS = 10_000

function certCheck(host) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: TIMEOUT_MS }, () => {
      const cert = socket.getPeerCertificate()
      socket.end()
      const daysLeft = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000)
      if (daysLeft < MIN_CERT_DAYS) reject(new Error(`certificate expires in ${daysLeft} days (${cert.valid_to})`))
      else resolve(`valid, ${daysLeft} days left`)
    })
    // A certificate that doesn't cover the hostname, or has expired, fails the
    // TLS handshake and lands here — the same thing a browser refuses.
    socket.on('error', err => reject(new Error(`TLS failed: ${err.code ?? err.message}`)))
    socket.on('timeout', () => { socket.destroy(); reject(new Error(`no TLS handshake within ${TIMEOUT_MS / 1000}s`)) })
  })
}

async function get(url, headers = {}) {
  const started = Date.now()
  try {
    const res = await fetch(url, { redirect: 'manual', headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
    return { res, ms: Date.now() - started }
  } catch (err) {
    if (err.name === 'TimeoutError') throw new Error(`no response within ${TIMEOUT_MS / 1000}s (page would sit loading)`)
    throw new Error(`request failed: ${err.cause?.code ?? err.cause?.message ?? err.message}`)
  }
}

function redirectCheck(url, expectedStatus, expectedTarget, headers) {
  return async () => {
    const { res, ms } = await get(url, headers)
    const target = res.headers.get('location') && new URL(res.headers.get('location'), url).href
    const statusOk = Array.isArray(expectedStatus) ? expectedStatus.includes(res.status) : res.status === expectedStatus
    if (!statusOk || target !== expectedTarget) {
      throw new Error(`expected ${expectedStatus} → ${expectedTarget}, got ${res.status} → ${target ?? '(no redirect)'}`)
    }
    return `${res.status} → ${target} in ${ms}ms`
  }
}

// The login page is the first thing every visitor sees; it must render, not
// just answer. Its Content-Security-Policy also names the Supabase project,
// which the stale-session check below needs for the auth cookie's name.
let supabaseRef = null
async function loginPageCheck() {
  const { res, ms } = await get(`${ORIGIN}/login`)
  const body = await res.text()
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`)
  if (!body.includes('Strategy Lab AI')) throw new Error('page loaded but is missing the "Strategy Lab AI" title')
  supabaseRef = (res.headers.get('content-security-policy') ?? '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? null
  return `200 in ${ms}ms`
}

// A browser carrying an old, expired login must still be sent to /login
// promptly, not left waiting while the server tries to revive the session.
async function staleSessionCheck() {
  if (!supabaseRef) return 'skipped (Supabase project not found in the login page CSP)'
  const session = { access_token: 'x.y.z', refresh_token: 'stale', expires_at: 1, expires_in: 3600, token_type: 'bearer', user: { id: '00000000-0000-0000-0000-000000000000' } }
  const cookie = `sb-${supabaseRef}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
  return redirectCheck(`${ORIGIN}/home`, 307, `${ORIGIN}/login?next=%2Fhome`, { cookie })()
}

const checks = [
  [`${APEX} certificate`, () => certCheck(APEX)],
  [`${WWW} certificate`, () => certCheck(WWW)],
  [`https://${WWW} forwards to ${APEX}`, redirectCheck(`https://${WWW}/`, 308, `${ORIGIN}/`)],
  [`http://${WWW} upgrades to https`, redirectCheck(`http://${WWW}/`, [301, 308], `https://${WWW}/`)],
  [`http://${APEX} upgrades to https`, redirectCheck(`http://${APEX}/`, [301, 308], `${ORIGIN}/`)],
  ['home page sends visitors to /login', redirectCheck(`${ORIGIN}/`, 307, `${ORIGIN}/login`)],
  ['login page loads', loginPageCheck],
  ['expired login is redirected promptly', staleSessionCheck],
]

let failed = 0
for (const [name, run] of checks) {
  // One retry, so a single network blip on the runner doesn't send an alert.
  let result
  try {
    result = await run()
  } catch {
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
    try { result = await run() } catch (err) { result = err }
  }
  if (result instanceof Error) { failed++; console.log(`FAIL  ${name}: ${result.message}`) }
  else console.log(`ok    ${name}: ${result}`)
}

if (failed) {
  console.log(`\n${failed} of ${checks.length} checks failed — the site may not be loading for visitors.`)
  process.exit(1)
}
console.log(`\nAll ${checks.length} checks passed.`)
