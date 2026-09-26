import { NOT_REPORTED, UNAVAILABLE } from './companyReport'

// Caps the data actually sent to the AI so cost stays flat regardless of how
// much news/insider activity a given company happens to have. The full,
// uncapped data is still fetched and shown in the report UI — only the AI
// prompt is trimmed, since that's the part billed per token.
function buildAiInputBundle(bundle: any) {
  const truncate = (s: string, n: number) => (typeof s === 'string' && s.length > n ? s.slice(0, n) + '…' : s)
  return {
    symbol: bundle.symbol,
    overview: { ...bundle.overview, businessSummary: truncate(bundle.overview.businessSummary, 400) },
    competitors: bundle.competitors.slice(0, 4),
    customerGrowth: bundle.customerGrowth,
    financialHealth: { ...bundle.financialHealth, income: { ...bundle.financialHealth.income, revenueHistory: Array.isArray(bundle.financialHealth.income.revenueHistory) ? bundle.financialHealth.income.revenueHistory.slice(-3) : bundle.financialHealth.income.revenueHistory } },
    management: {
      ceo: bundle.management.ceo, cfo: bundle.management.cfo,
      insiderOwnershipPct: bundle.management.insiderOwnershipPct, institutionalOwnershipPct: bundle.management.institutionalOwnershipPct,
      recentInsiderTransactions: bundle.management.recentInsiderTransactions.slice(0, 3),
    },
    news: bundle.news.slice(0, 2).map((n: any) => ({ title: n.title, description: truncate(n.description, 100) })),
    catalysts: bundle.catalysts,
    technicals: bundle.technicals,
    shareholderReturns: bundle.shareholderReturns,
  }
}

export async function generateNarrative(bundle: any): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const fallback = buildFallbackNarrative(bundle)
  if (!apiKey) return { mode: 'template', ...fallback }
  try {
    const aiInput = buildAiInputBundle(bundle)
    const prompt = `Equity research notes on ${bundle.overview.name} (${bundle.symbol}). Use ONLY the JSON data below (already trimmed to the essentials) — never invent numbers, competitors, customers, executives, or events not present in it. If something is missing, write exactly "Not publicly reported" or "Data unavailable". Be extremely concise — short sentences, no filler, no restating numbers you already showed elsewhere. Do not exceed the word/bullet limits given.

DATA:
${JSON.stringify(aiInput)}

Return ONLY strict JSON, no markdown, in exactly this shape (keep every field within its stated limit):
{
  "businessExplanation": "1 short sentence: what the company does, plain language.",
  "competitiveAnalysis": "2 short sentences on how it stacks up vs the competitors array on margins/growth/cap. No winner declared.",
  "customerGrowthAnalysis": "1 short sentence.",
  "brandStrengthFacts": ["1 short documented-fact bullet"],
  "brandStrengthInference": ["1 short bullet, clearly speculative"],
  "swot": {
    "strengths": ["2 short bullets"],
    "weaknesses": ["2 short bullets"],
    "opportunities": ["2 short bullets, mark inference-heavy ones (AI inference)"],
    "threats": ["2 short bullets, mark inference-heavy ones (AI inference)"]
  },
  "executiveSummary": "3 short sentences covering condition, trajectory, and what to watch.",
  "newsCommentary": [{"title":"(exact title of at most the top 2 news items)","whyItMatters":"1 short sentence"}],
  "catalystCommentary": "1 short sentence, no outcome prediction.",
  "technicalsCommentary": "1 short sentence on what the indicators show, no prediction.",
  "finalAnalysis": "3 short sentences synthesizing what matters most."
}`
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 12000, messages: [{ role: 'user', content: prompt }] }),
    })
    const j = await r.json()
    if (j?.usage) console.error('company-report AI usage', JSON.stringify(j.usage))
    if (j?.stop_reason === 'max_tokens') console.error('company-report AI response hit max_tokens before finishing')
    const text = Array.isArray(j?.content) ? j.content.find((b: any) => b?.type === 'text')?.text : undefined
    if (!text || text.indexOf('{') === -1) { console.error('company-report AI response had no usable text', JSON.stringify(j).slice(0, 1500)); return { mode: 'template', ...fallback } }
    try {
      const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
      return { mode: 'ai', ...parsed }
    } catch (parseErr) {
      console.error('company-report AI JSON.parse failed on text:', text.slice(0, 2000))
      return { mode: 'template', ...fallback }
    }
  } catch (e) {
    console.error('company-report AI call failed, using template fallback', e)
    return { mode: 'template', ...fallback }
  }
}

function pct(n: number | null, digits = 1): string { return n == null ? UNAVAILABLE : `${(n * 100).toFixed(digits)}%` }

function buildFallbackNarrative(bundle: any) {
  const o = bundle.overview, sr = bundle.competitors[0]
  return {
    businessExplanation: o.businessSummary === NOT_REPORTED ? NOT_REPORTED : o.businessSummary,
    competitiveAnalysis: bundle.competitors.length > 1
      ? `${o.name} reports ${pct(sr.revenueGrowth)} revenue growth and a ${pct(sr.netMargin)} net margin, versus competitors averaging ${pct(bundle.competitors.slice(1).reduce((s: number, c: any) => s + (c.netMargin || 0), 0) / Math.max(1, bundle.competitors.length - 1))} net margin. See the comparison table for full figures.`
      : 'No comparable publicly traded competitors could be identified through this tool\'s free data sources.',
    customerGrowthAnalysis: NOT_REPORTED,
    brandStrengthFacts: [`Gross margin: ${pct(sr.grossMargin)}`, `Analyst coverage: ${bundle.catalysts.numberOfAnalysts ?? UNAVAILABLE} analysts, mean price target ${bundle.catalysts.analystTargetMean != null ? `$${bundle.catalysts.analystTargetMean}` : UNAVAILABLE}`],
    brandStrengthInference: ['(AI inference unavailable — no ANTHROPIC_API_KEY configured for this deployment.)'],
    swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
    executiveSummary: 'AI-written narrative analysis is unavailable because no ANTHROPIC_API_KEY is configured for this deployment. All figures above are real and directly sourced/computed, but the written synthesis sections require an AI key to generate.',
    newsCommentary: [],
    catalystCommentary: bundle.catalysts.nextEarningsDate !== NOT_REPORTED ? `Next earnings date: ${bundle.catalysts.nextEarningsDate}.` : NOT_REPORTED,
    technicalsCommentary: `Trend: ${bundle.technicals.trend}.`,
    finalAnalysis: 'AI-written synthesis is unavailable because no ANTHROPIC_API_KEY is configured for this deployment.',
  }
}
