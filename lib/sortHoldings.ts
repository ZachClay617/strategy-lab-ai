// The comparator behind the sortable HOLDINGS columns on /portfolios. It lives
// here rather than inside the page component so it can be tested directly —
// "sort by weight, most to least" is the kind of thing that looks obviously
// right and is quietly wrong for the rows with no data yet.
export type HoldingsSortKey = 'weight' | 'equity' | 'return' | 'dayReturn'
export type HoldingsSortDir = 'desc' | 'asc'
export type HoldingsSort = { key: HoldingsSortKey; dir: HoldingsSortDir }

// Nulls — no live price fetched yet, or no average cost recorded — always sort
// to the bottom whichever direction is chosen. Treating them as negative
// infinity would put every unpriced row at the top of a "least to most" sort,
// which reads as a claim that they are the smallest rather than unknown.
export function sortHoldings<T>(
  rows: T[],
  sort: HoldingsSort | null,
  valueOf: (row: T, key: HoldingsSortKey) => number | null,
): T[] {
  if (!sort) return rows
  return [...rows].sort((a, b) => {
    const va = valueOf(a, sort.key)
    const vb = valueOf(b, sort.key)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    return sort.dir === 'desc' ? vb - va : va - vb
  })
}

// Clicking a column sorts it most-to-least; clicking the same column again
// flips it; clicking a different column starts that one at most-to-least.
export function nextHoldingsSort(current: HoldingsSort | null, key: HoldingsSortKey): HoldingsSort {
  if (current && current.key === key) return { key, dir: current.dir === 'desc' ? 'asc' : 'desc' }
  return { key, dir: 'desc' }
}
