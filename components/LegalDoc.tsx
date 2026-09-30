import fs from 'node:fs'
import path from 'node:path'
import Link from 'next/link'
import type { ReactNode } from 'react'

// Server-side renderer for the legal documents in legal/content/*.md.
// The markdown is authored by us and uses a fixed subset (#/##/### headings,
// "- " bullets, **bold**, blank-line paragraphs), so a small purpose-built
// parser keeps these pages dependency-free and fully static.

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-')
}

function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  const parts = text.split(/\*\*/)
  parts.forEach((part, i) => {
    if (!part) return
    // Odd indices were between ** pairs → bold.
    const node = i % 2 === 1 ? <strong key={`${keyBase}-b${i}`}>{part}</strong> : part
    // Auto-link the site's own policy paths when they appear in the text.
    out.push(node)
  })
  return out
}

type Block =
  | { kind: 'h1' | 'h2' | 'h3'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }

export function parseLegalMarkdown(md: string): Block[] {
  const lines = md.split('\n')
  const blocks: Block[] = []
  let para: string[] = []
  let list: string[] | null = null
  const flushPara = () => { if (para.length) { blocks.push({ kind: 'p', text: para.join(' ') }); para = [] } }
  const flushList = () => { if (list) { blocks.push({ kind: 'ul', items: list }); list = null } }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) { flushPara(); flushList(); continue }
    if (line.startsWith('### ')) { flushPara(); flushList(); blocks.push({ kind: 'h3', text: line.slice(4) }); continue }
    if (line.startsWith('## ')) { flushPara(); flushList(); blocks.push({ kind: 'h2', text: line.slice(3) }); continue }
    if (line.startsWith('# ')) { flushPara(); flushList(); blocks.push({ kind: 'h1', text: line.slice(2) }); continue }
    if (line.startsWith('- ')) { flushPara(); (list ||= []).push(line.slice(2)); continue }
    flushList(); para.push(line.trim())
  }
  flushPara(); flushList()
  return blocks
}

export function loadLegalMarkdown(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'legal', 'content', file), 'utf8')
}

export default function LegalDoc({ file }: { file: string }) {
  const blocks = parseLegalMarkdown(loadLegalMarkdown(file))
  const toc = blocks.filter(b => b.kind === 'h2') as { kind: 'h2'; text: string }[]
  let afterTitle = 0
  return (
    <main className="shell legal-shell">
      <article className="legal-doc">
        {blocks.map((b, i) => {
          if (b.kind === 'h1') { afterTitle = i; return <h1 key={i}>{b.text}</h1> }
          if (b.kind === 'h2') return <h2 key={i} id={slugify(b.text)}>{renderInline(b.text, `h${i}`)}</h2>
          if (b.kind === 'h3') return <h3 key={i} id={slugify(b.text)}>{renderInline(b.text, `h${i}`)}</h3>
          if (b.kind === 'ul') return (
            <ul key={i}>{b.items.map((item, j) => <li key={j}>{renderInline(item, `li${i}-${j}`)}</li>)}</ul>
          )
          const isMeta = i <= afterTitle + 2 && (b.text.includes('strategylabai.net') || b.text.startsWith('Effective Date'))
          const node = <p key={i} className={isMeta ? 'legal-meta' : undefined}>{renderInline(b.text, `p${i}`)}</p>
          // Insert the table of contents right after the title/meta block.
          if (i === afterTitle + 1 && toc.length > 3) {
            return (
              <div key={i}>
                {node}
                <nav className="legal-toc" aria-label="Table of contents">
                  <h2>Contents</h2>
                  <ol>{toc.map(h => <li key={h.text}><a href={`#${slugify(h.text)}`}>{h.text}</a></li>)}</ol>
                </nav>
              </div>
            )
          }
          return node
        })}
        <p className="legal-backlinks">
          Related policies: <Link href="/terms">Terms of Service</Link> · <Link href="/privacy">Privacy Policy</Link> · <Link href="/disclaimer">Investment &amp; Trading Disclaimer</Link> · <Link href="/refunds">Refund &amp; Cancellation Policy</Link>
        </p>
      </article>
    </main>
  )
}
