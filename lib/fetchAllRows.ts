// PostgREST refuses to return more than `db-max-rows` for a single request —
// 1000 on Supabase by default — and it does so silently: the response is a
// normal 200 with the first 1000 rows and no error. For a user-facing list
// that is a cosmetic truncation, but the two service-role cron jobs read
// EVERY user's rows in one query and then fold them together per portfolio or
// per user. Past 1000 total rows they would quietly start seeing a partial
// picture and writing wrong numbers — a portfolio missing half its holdings
// still gets a confident-looking return_pct written for it every hour.
//
// This walks the table in pages until a short page proves the end was
// reached, so those jobs stay correct as the table grows.
const PAGE_SIZE = 1000

// A hard stop so a runaway table can never turn one cron invocation into an
// unbounded loop against the database. Hitting it is a signal to move the job
// to per-user batching, so it is logged loudly rather than passing silently.
const MAX_PAGES = 200

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label = 'query',
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = []
  for (let p = 0; p < MAX_PAGES; p++) {
    const from = p * PAGE_SIZE
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) return { data: rows, error }
    const batch = data || []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) return { data: rows, error: null }
  }
  console.error(`fetchAllRows(${label}) hit the ${MAX_PAGES}-page ceiling (${rows.length} rows); results are truncated`)
  return { data: rows, error: null }
}
