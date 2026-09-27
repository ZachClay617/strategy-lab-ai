// Dedicated worker used purely as a pacing clock for the research loop.
// Browsers throttle setTimeout/setInterval on the main thread once a tab is
// backgrounded (clamped to >=1s almost immediately, then to ~1/min after a
// few minutes hidden). A worker's timers are not subject to that page
// visibility throttling, so routing the loop's pacing through here keeps
// A-TAMP testing at full speed even when the tab isn't focused.
onmessage=(e:MessageEvent<{id:number;ms:number}>)=>{
  const {id,ms}=e.data
  setTimeout(()=>{(postMessage as any)({id})},ms)
}
export {}
