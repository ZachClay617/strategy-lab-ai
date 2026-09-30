import { describe, it, expect, vi } from 'vitest'
import { fetchAllRows } from './fetchAllRows'

function pagedSource(total: number) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i }))
  const calls: [number, number][] = []
  const page = async (from: number, to: number) => {
    calls.push([from, to])
    // Mirrors PostgREST: a range wider than db-max-rows is clamped to 1000.
    return { data: all.slice(from, Math.min(to + 1, from + 1000)), error: null }
  }
  return { page, calls }
}

describe('fetchAllRows', () => {
  it('returns everything from a single short page', async () => {
    const { page, calls } = pagedSource(12)
    const { data, error } = await fetchAllRows(page)
    expect(error).toBeNull()
    expect(data).toHaveLength(12)
    expect(calls).toEqual([[0, 999]])
  })

  it('keeps paging past the 1000-row ceiling that would otherwise truncate silently', async () => {
    const { page, calls } = pagedSource(2500)
    const { data } = await fetchAllRows(page)
    expect(data).toHaveLength(2500)
    expect(data[0]).toEqual({ id: 0 })
    expect(data[2499]).toEqual({ id: 2499 })
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('makes one extra request when the total is an exact multiple of the page size', async () => {
    const { page, calls } = pagedSource(2000)
    const { data } = await fetchAllRows(page)
    expect(data).toHaveLength(2000)
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('returns the rows gathered so far alongside an error', async () => {
    let n = 0
    const { data, error } = await fetchAllRows(async (from, to) => {
      if (n++ === 0) return { data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null }
      return { data: null, error: { message: 'connection reset' } }
    })
    expect(error).toEqual({ message: 'connection reset' })
    expect(data).toHaveLength(1000)
  })

  it('stops at the page ceiling instead of looping forever, and says so', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { data, error } = await fetchAllRows(
      async () => ({ data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null }),
      'runaway',
    )
    expect(error).toBeNull()
    expect(data).toHaveLength(200 * 1000)
    expect(spy).toHaveBeenCalledOnce()
    spy.mockRestore()
  })
})
