import { describe, it, expect } from 'vitest'
import { confirmBuySignal, confirmSellSignal, dismissSignal } from './tradeConfirm'

// A minimal fake Supabase client covering only the chained calls
// tradeConfirm.ts actually makes (from/insert/update/eq/select/maybeSingle).
// `acknowledged` models the real "claim" row: the first update that sets
// acknowledged=true on a not-yet-acknowledged row succeeds; any further
// attempt on the same notification finds no matching row, exactly like the
// real `.eq('acknowledged', false)` guard against double-confirmation.
function makeMockClient() {
  const calls: { table: string; op: 'insert' | 'update'; payload: any }[] = []
  let acknowledged = false
  function from(table: string) {
    const chain: any = {}
    chain.insert = (payload: any) => { calls.push({ table, op: 'insert', payload }); chain._payload = payload; return chain }
    chain.update = (payload: any) => { calls.push({ table, op: 'update', payload }); chain._payload = payload; return chain }
    chain.eq = () => chain
    chain.select = () => chain
    chain.maybeSingle = async () => {
      if (table === 'trade_notifications' && chain._payload?.acknowledged === true) {
        if (acknowledged) return { data: null }
        acknowledged = true
        return { data: { id: 'notif-1' } }
      }
      if (table === 'live_positions' && chain._payload) return { data: { id: 'pos-1' } }
      return { data: null }
    }
    return chain
  }
  return { from, calls }
}

describe('confirmBuySignal — ticker-binding regression guard', () => {
  it('writes live_positions with exactly the notification\'s own symbol/market/strategy_id, never a substituted value', async () => {
    const { from, calls } = makeMockClient()
    const notification = { id: 'n1', strategy_id: 's1', symbol: 'AAPL', market: 'Stocks', price: 150 }
    const ok = await confirmBuySignal({ from }, 'user-1', notification)
    expect(ok).toBe(true)
    const insertCall = calls.find(c => c.table === 'live_positions' && c.op === 'insert')
    expect(insertCall?.payload).toMatchObject({ user_id: 'user-1', strategy_id: 's1', symbol: 'AAPL', market: 'Stocks' })
  })

  it('does nothing if the notification has no strategy_id', async () => {
    const { from, calls } = makeMockClient()
    const ok = await confirmBuySignal({ from }, 'user-1', { id: 'n1', symbol: 'AAPL', market: 'Stocks', price: 1 })
    expect(ok).toBe(false)
    expect(calls.find(c => c.table === 'live_positions')).toBeUndefined()
  })

  it('only lets one caller claim and act on the same notification (prevents duplicate positions)', async () => {
    const { from, calls } = makeMockClient()
    const client = { from }
    const notification = { id: 'n1', strategy_id: 's1', symbol: 'AAPL', market: 'Stocks', price: 100 }
    const [first, second] = await Promise.all([
      confirmBuySignal(client, 'u1', notification),
      confirmBuySignal(client, 'u1', notification),
    ])
    expect([first, second].filter(Boolean).length).toBe(1)
    expect(calls.filter(c => c.table === 'live_positions' && c.op === 'insert').length).toBe(1)
  })
})

describe('confirmSellSignal / dismissSignal', () => {
  it('closes the referenced position only after successfully claiming the notification', async () => {
    const { from, calls } = makeMockClient()
    const ok = await confirmSellSignal({ from }, { id: 'n1', symbol: 'AAPL', market: 'Stocks', price: 160, position_id: 'pos-1' })
    expect(ok).toBe(true)
    const closeCall = calls.find(c => c.table === 'live_positions' && c.op === 'update')
    expect(closeCall?.payload).toMatchObject({ status: 'closed', exit_price: 160 })
  })

  it('dismissSignal returns false for an already-acknowledged notification', async () => {
    const { from } = makeMockClient()
    const first = await dismissSignal({ from }, 'n1')
    const second = await dismissSignal({ from }, 'n1')
    expect(first).toBe(true)
    expect(second).toBe(false)
  })
})

describe('price guards', () => {
  it('refuses a buy whose signal never resolved a price, instead of recording $0.00', async () => {
    const client = makeMockClient()
    const ok = await confirmBuySignal(client as any, 'user-1', { id: 'notif-1', strategy_id: 'strat-1', symbol: 'AAPL', market: 'Stocks', price: null })
    expect(ok).toBe(false)
    // Nothing was claimed or inserted, so the notification is still actionable
    // once a real price comes through.
    expect(client.calls).toHaveLength(0)
  })

  it('refuses to close a position at $0.00 when the sell signal has no price', async () => {
    const client = makeMockClient()
    const ok = await confirmSellSignal(client as any, { id: 'notif-1', symbol: 'AAPL', market: 'Stocks', price: null, position_id: 'pos-1' })
    expect(ok).toBe(false)
    expect(client.calls).toHaveLength(0)
  })

  it('still dismisses a priceless sell that has no position attached', async () => {
    const client = makeMockClient()
    const ok = await confirmSellSignal(client as any, { id: 'notif-1', symbol: 'AAPL', market: 'Stocks', price: null, position_id: null })
    expect(ok).toBe(true)
  })

  it('records the real price when one is present', async () => {
    const client = makeMockClient()
    const ok = await confirmBuySignal(client as any, 'user-1', { id: 'notif-1', strategy_id: 'strat-1', symbol: 'AAPL', market: 'Stocks', price: 187.42 })
    expect(ok).toBe(true)
    const insert = client.calls.find(c => c.table === 'live_positions' && c.op === 'insert')
    expect(insert?.payload.entry_price).toBe(187.42)
  })
})
