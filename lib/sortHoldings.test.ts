import { describe, it, expect } from 'vitest'
import { sortHoldings, nextHoldingsSort, type HoldingsSortKey } from './sortHoldings'

type Row = { sym: string; weight: number | null; equity: number | null; ret: number | null; day: number | null }

const rows: Row[] = [
  { sym: 'AAPL', weight: 20, equity: 2000, ret: 5, day: -1 },
  { sym: 'MSFT', weight: 50, equity: 5000, ret: -3, day: 2 },
  { sym: 'NVDA', weight: 30, equity: 3000, ret: 12, day: 0.5 },
  { sym: 'NEW', weight: null, equity: null, ret: null, day: null },
]

const valueOf = (r: Row, key: HoldingsSortKey) =>
  key === 'weight' ? r.weight : key === 'equity' ? r.equity : key === 'return' ? r.ret : r.day

const order = (sort: Parameters<typeof sortHoldings>[1]) =>
  sortHoldings(rows, sort, valueOf).map(r => r.sym)

describe('sortHoldings', () => {
  it('leaves the rows alone when nothing is sorted', () => {
    expect(order(null)).toEqual(['AAPL', 'MSFT', 'NVDA', 'NEW'])
  })

  it('sorts every column most to least', () => {
    expect(order({ key: 'weight', dir: 'desc' })).toEqual(['MSFT', 'NVDA', 'AAPL', 'NEW'])
    expect(order({ key: 'equity', dir: 'desc' })).toEqual(['MSFT', 'NVDA', 'AAPL', 'NEW'])
    expect(order({ key: 'return', dir: 'desc' })).toEqual(['NVDA', 'AAPL', 'MSFT', 'NEW'])
    expect(order({ key: 'dayReturn', dir: 'desc' })).toEqual(['MSFT', 'NVDA', 'AAPL', 'NEW'])
  })

  it('sorts every column least to most', () => {
    expect(order({ key: 'weight', dir: 'asc' })).toEqual(['AAPL', 'NVDA', 'MSFT', 'NEW'])
    expect(order({ key: 'equity', dir: 'asc' })).toEqual(['AAPL', 'NVDA', 'MSFT', 'NEW'])
    expect(order({ key: 'return', dir: 'asc' })).toEqual(['MSFT', 'AAPL', 'NVDA', 'NEW'])
    expect(order({ key: 'dayReturn', dir: 'asc' })).toEqual(['AAPL', 'NVDA', 'MSFT', 'NEW'])
  })

  it('keeps rows with no data at the bottom in BOTH directions', () => {
    for (const key of ['weight', 'equity', 'return', 'dayReturn'] as HoldingsSortKey[]) {
      expect(order({ key, dir: 'desc' }).at(-1)).toBe('NEW')
      expect(order({ key, dir: 'asc' }).at(-1)).toBe('NEW')
    }
  })

  it('handles negative values correctly rather than by magnitude', () => {
    expect(order({ key: 'return', dir: 'asc' })[0]).toBe('MSFT') // -3 is the smallest
    expect(order({ key: 'return', dir: 'desc' })[0]).toBe('NVDA') // +12 is the largest
  })

  it('does not mutate the array it was given', () => {
    const before = rows.map(r => r.sym)
    sortHoldings(rows, { key: 'weight', dir: 'asc' }, valueOf)
    expect(rows.map(r => r.sym)).toEqual(before)
  })
})

describe('nextHoldingsSort', () => {
  it('starts a fresh column at most to least', () => {
    expect(nextHoldingsSort(null, 'weight')).toEqual({ key: 'weight', dir: 'desc' })
  })

  it('flips the same column, so both directions are reachable', () => {
    const first = nextHoldingsSort(null, 'equity')
    const second = nextHoldingsSort(first, 'equity')
    const third = nextHoldingsSort(second, 'equity')
    expect(first.dir).toBe('desc')
    expect(second.dir).toBe('asc')
    expect(third.dir).toBe('desc')
  })

  it('resets to most to least when switching columns', () => {
    const asc = { key: 'weight', dir: 'asc' } as const
    expect(nextHoldingsSort(asc, 'return')).toEqual({ key: 'return', dir: 'desc' })
  })
})
