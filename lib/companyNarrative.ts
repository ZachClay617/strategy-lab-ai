import { NOT_REPORTED, UNAVAILABLE } from './companyReport'

// Caps the data actually sent to the AI so cost stays flat regardless of how
// much news/insider activity a given company happens to have. The full,
// uncapped data is still fetched and shown in the report UI — only the AI
// prompt is trimmed, since that's the part billed per token.
function buildAiInputBundle(bundle: any) {
  const truncate = (s: string, n: number) => (typeof s === 'string' && s.length > n ? s.slice(0, n) + '…' : s)
  return {
    ...bundle,
    overview: { ...bundle.overview, businessSummary: truncate(bundle.overview.businessSummary, 700) },
    competitors: bundle.competitors.slice(0, 5),
    news: bundle.news.slice(0, 4).map((n: any) => ({ ...n, description: truncate(n.description, 140) })),
    analystRevisions: bundle.analystRevisions.slice(0, 5),
    earningsSurprises: bundle.earningsSurprises.slice(-4),
    management: {
      ...bundle.management,
      officers: bundle.management.officers.slice(0, 5),
      recentInsiderHolders: bundle.management.recentInsiderHolders.slice(0, 5),
      recentInsiderTransactions: bundle.management.recentInsiderTransactions.slice(0, 5),
    },
  }
}

export async function generateNarrative(bundle: any): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const fallback = buildFallbackNarrative(bundle)
  if (!apiKey) return { mode: 'template', ...fallback }
  try {
    const aiInput = buildAiInputBundle(bundle)
    const prompt = `You are writing sections of an equity research report on ${bundle.overview.name} (${bundle.symbol}) using ONLY the real data JSON below (it has been trimmed to the most relevant recent items, not the full history). This data was pulled from Yahoo Finance and computed directly from real historical prices — do not invent any numbers, competitors, customers, executives, or events that are not present in this JSON. If something needed for a section is missing from the data, say so explicitly using the exact phrase "Not publicly reported" or "Data unavailable" rather than guessing. Be concise and do not exceed the requested lengths below — this keeps the report consistent in size across different companies.

DATA:
${JSON.stringify(aiInput)}

Respond with ONLY strict JSON (no markdown, no prose outside the JSON) in exactly this shape:
{
  "businessExplanation": "2-4 sentences explaining in plain language, for someone unfamiliar with the company, what it does, based on the businessSummary and segments in the data.",
  "competitiveAnalysis": "A few sentences comparing the company to the competitors array on the metrics actually present (revenue, margins, growth, market cap, FCF, debt, cash, 1yr return). State advantages and disadvantages you can see in the numbers, and whether the position looks like it is strengthening, weakening, or stable based only on the documented figures. Do not declare a single 'winner' or give arbitrary scores.",
  "customerGrowthAnalysis": "If customerGrowth.status is 'Not publicly reported', just state that this company does not publicly report customer/user metrics and briefly note that growth quality here should be inferred only from revenue growth in financialHealth. Do not estimate a customer count.",
  "brandStrengthFacts": ["bullet points of DOCUMENTED facts relevant to brand strength, e.g. margins implying pricing power, analyst sentiment, dividend consistency — cite the actual numbers from the data"],
  "brandStrengthInference": ["bullet points explicitly labeled as AI analysis/inference about brand strength that go beyond the raw numbers — keep these clearly speculative in tone"],
  "swot": {
    "strengths": ["3-5 bullets grounded in the data"],
    "weaknesses": ["3-5 bullets grounded in the data"],
    "opportunities": ["3-5 bullets, label inference-heavy ones as (AI inference)"],
    "threats": ["3-5 bullets, label inference-heavy ones as (AI inference)"]
  },
  "executiveSummary": "A concise, scannable paragraph (5-8 sentences) covering what the company does, business condition, growth trajectory, competitive position, brand strength, financial condition, opportunities, risks, and what to monitor next — using only the provided data.",
  "newsCommentary": [{"title":"(copy exact title from a news item)","whyItMatters":"1-2 sentences on why it matters and potential implications, staying grounded in what the headline/description actually says"}],
  "catalystCommentary": "1-3 sentences on what investors will likely watch at the next earnings date given the analyst estimates in the data, with no prediction of the outcome.",
  "technicalsCommentary": "2-4 sentences explaining what the moving averages, RSI, MACD, and relative performance vs SPY in the data show about the current technical picture, with no price prediction.",
  "finalAnalysis": "A closing 5-8 sentence synthesis connecting revenue growth, margins, free cash flow, competitive position, management/insider activity, news, catalysts, technicals, and shareholder returns from the data — answering 'what actually matters about this company' without inventing facts."
}`
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 12000, messages: [{ role: 'user', content: prompt }] }),
    })
    const j = await r.json()
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
