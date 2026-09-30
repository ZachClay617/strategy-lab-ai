// Regenerate the Word versions of the business documents:
//
//   NODE_PATH=./node_modules node scripts/md2docx.js
//
// Source of truth is the markdown (BUSINESS_PLAN.md, INVESTOR_MEMORANDUM.md).
// Edit those, re-run this, and the .docx files are rebuilt — so the two never
// drift apart the way hand-edited Word copies always do.
//
// Markdown -> polished .docx for the Strategy Lab AI business documents.
// Deliberately narrow: it handles exactly the markdown these two files use
// (headings, paragraphs, tables, bullet/numbered/checkbox lists, blockquotes,
// fenced code, rules, and inline bold/italic/code/links) rather than trying to
// be a general converter.
const fs = require('fs')
const path = require('path')
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  PageOrientation, Header, Footer, PageNumber, LevelFormat, convertInchesToTwip, PageBreak,
  ExternalHyperlink,
} = require('docx')

// ---------- design tokens ----------
const BODY = 'Calibri'
const MONO = 'Consolas'
const INK = '1A1D23'
const INK_SOFT = '4A5160'
const ACCENT = '1F4FD8'       // print-safe version of the app's blue
const ACCENT_DEEP = '16307F'
const RULE = 'C9CFDB'
const TABLE_HEAD_BG = 'EEF2FB'
const TABLE_ALT_BG = 'F7F9FD'
const CODE_BG = 'F4F5F8'

const PAGE_W = 12240, PAGE_H = 15840          // US Letter, DXA
const MARGIN = convertInchesToTwip(1)
const CONTENT_W = PAGE_W - MARGIN * 2          // 9360
const CALLOUT_PAD = 220
const CALLOUT_W = CONTENT_W - CALLOUT_PAD * 2 - 120   // room inside the callout box

// ---------- inline tokenizer ----------
// Returns TextRun/ExternalHyperlink children for a line of markdown.
function inline(text, base = {}) {
  const out = []
  // Order matters: links first (their label can contain other markup), then
  // code (never nested), then bold, then italic.
  const re = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\n]+)\*/g
  let last = 0, m
  const push = (t, extra = {}) => { if (t) out.push(new TextRun({ text: t, font: BODY, color: INK, size: 21, ...base, ...extra })) }
  while ((m = re.exec(text)) !== null) {
    push(text.slice(last, m.index))
    if (m[1] !== undefined) {
      out.push(new ExternalHyperlink({
        link: m[2],
        children: [new TextRun({ text: m[1], font: BODY, size: 21, color: ACCENT, underline: {}, ...base })],
      }))
    } else if (m[3] !== undefined) {
      push(m[3], { font: MONO, size: 19, color: ACCENT_DEEP, shading: { type: ShadingType.CLEAR, fill: CODE_BG } })
    } else if (m[4] !== undefined) {
      push(m[4], { bold: true })
    } else if (m[5] !== undefined) {
      push(m[5], { italics: true })
    }
    last = re.lastIndex
  }
  push(text.slice(last))
  return out.length ? out : [new TextRun({ text: '', font: BODY, size: 21 })]
}

// ---------- block helpers ----------
const HEADING_SPEC = {
  1: { level: HeadingLevel.HEADING_1, size: 30, color: ACCENT_DEEP, before: 420, after: 160, rule: true },
  2: { level: HeadingLevel.HEADING_2, size: 25, color: ACCENT, before: 340, after: 120 },
  3: { level: HeadingLevel.HEADING_3, size: 22, color: INK, before: 260, after: 90 },
  4: { level: HeadingLevel.HEADING_4, size: 21, color: INK_SOFT, before: 220, after: 80 },
}

function heading(depth, text) {
  const spec = HEADING_SPEC[Math.min(depth, 4)]
  return new Paragraph({
    heading: spec.level,
    spacing: { before: spec.before, after: spec.after },
    keepNext: true,
    ...(spec.rule ? { border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: RULE, space: 6 } } } : {}),
    children: inline(text, { bold: true, size: spec.size, color: spec.color, font: BODY }),
  })
}

function para(text, opts = {}) {
  const { indent, ...rest } = opts
  return new Paragraph({
    spacing: { after: 140, line: 276 },
    ...(indent ? { indent: { left: indent } } : {}),
    ...rest,
    children: inline(text),
  })
}

function bullet(text, { numbered = false, checkbox = null, indent = 0 } = {}) {
  const children = []
  if (checkbox !== null) {
    children.push(new TextRun({ text: checkbox ? '☑  ' : '☐  ', font: BODY, size: 21, color: ACCENT }))
  }
  children.push(...inline(text))
  return new Paragraph({
    numbering: { reference: numbered ? 'ordered' : 'bulleted', level: Math.min(indent, 2) },
    spacing: { after: 70, line: 276 },
    children,
  })
}

function rule() {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 1 } },
    children: [new TextRun({ text: '', size: 2 })],
  })
}

function codeBlock(lines) {
  return lines.map((l, i) => new Paragraph({
    spacing: { after: i === lines.length - 1 ? 160 : 0, line: 240 },
    shading: { type: ShadingType.CLEAR, fill: CODE_BG },
    indent: { left: 180, right: 180 },
    children: [new TextRun({ text: l || ' ', font: MONO, size: 18, color: INK })],
  }))
}

// ---------- tables ----------
function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
}

function buildTable(rows, width = CONTENT_W) {
  const header = splitRow(rows[0])
  const aligns = splitRow(rows[1]).map(s => s.startsWith(':') && s.endsWith(':') ? AlignmentType.CENTER : s.endsWith(':') ? AlignmentType.RIGHT : AlignmentType.LEFT)
  const body = rows.slice(2).map(splitRow)
  const cols = header.length

  // Weight columns by their widest cell so a "Use / Amount / What it buys"
  // table doesn't give the one-word column the same room as the prose one.
  const weights = []
  for (let c = 0; c < cols; c++) {
    const widest = Math.max(header[c]?.length || 1, ...body.map(r => (r[c] || '').length))
    weights.push(Math.max(6, Math.min(widest, 70)))
  }
  const total = weights.reduce((a, b) => a + b, 0)
  const colWidths = weights.map(w => Math.floor(width * w / total))
  colWidths[cols - 1] = width - colWidths.slice(0, -1).reduce((a, b) => a + b, 0)

  const hair = { style: BorderStyle.SINGLE, size: 4, color: RULE }
  const cell = (text, c, { head = false, alt = false } = {}) => new TableCell({
    width: { size: colWidths[c], type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill: head ? TABLE_HEAD_BG : alt ? TABLE_ALT_BG : 'FFFFFF' },
    margins: { top: 90, bottom: 90, left: 130, right: 130 },
    children: [new Paragraph({
      alignment: aligns[c] || AlignmentType.LEFT,
      spacing: { after: 0, line: 252 },
      children: inline(text || '', head ? { size: 19, bold: true, color: ACCENT_DEEP } : { size: 19 }),
    })],
  })

  return new Table({
    columnWidths: colWidths,
    width: { size: width, type: WidthType.DXA },
    borders: { top: hair, bottom: hair, left: hair, right: hair, insideHorizontal: hair, insideVertical: hair },
    rows: [
      new TableRow({ tableHeader: true, children: header.map((h, c) => cell(h, c, { head: true })) }),
      ...body.map((r, i) => new TableRow({
        children: Array.from({ length: cols }, (_, c) => cell(r[c], c, { alt: i % 2 === 1 })),
      })),
    ],
  })
}

// ---------- callout (blockquote) ----------
function callout(innerBlocks) {
  // One-cell table: gives the box a real background and a thick accent edge,
  // which reads far better on paper than an indented blockquote.
  return new Table({
    columnWidths: [CONTENT_W],
    width: { size: CONTENT_W, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      left: { style: BorderStyle.SINGLE, size: 24, color: ACCENT },
      right: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: CONTENT_W, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: 'F8FAFE' },
        margins: { top: 200, bottom: 200, left: 220, right: 220 },
        children: innerBlocks,
      })],
    })],
  })
}

// ---------- the parser ----------
// Word's outline (and its Navigation Pane) should start at Heading 1. The
// business plan's top level is "## 1. Executive Summary" and the memorandum's
// is "# Part I", so rather than hard-coding either, find the shallowest
// heading left after the cover is removed and promote everything to match.
function headingShift(lines) {
  let min = 6
  let inFence = false
  for (const l of lines) {
    if (/^```/.test(l.trim())) { inFence = !inFence; continue }
    if (inFence) continue
    const m = l.trim().match(/^(#{1,6})\s+\S/)
    if (m) min = Math.min(min, m[1].length)
  }
  return min === 6 ? 0 : min - 1
}

function parse(lines, shift = 0, width = CONTENT_W) {
  const out = []
  let i = 0
  let paraBuf = []

  const flushPara = () => {
    if (!paraBuf.length) return
    out.push(para(paraBuf.join(' ')))
    paraBuf = []
  }

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // fenced code
    if (/^```/.test(trimmed)) {
      flushPara()
      const buf = []
      i++
      while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++ }
      i++
      out.push(...codeBlock(buf))
      continue
    }

    // blockquote -> callout
    if (/^>/.test(trimmed)) {
      flushPara()
      const buf = []
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      out.push(callout(parse(buf, shift, CALLOUT_W)))
      out.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: '', size: 2 })] }))
      continue
    }

    // table
    if (/^\|/.test(trimmed) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      flushPara()
      const buf = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) { buf.push(lines[i]); i++ }
      out.push(buildTable(buf, width))
      out.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: '', size: 2 })] }))
      continue
    }

    // heading
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (h) { flushPara(); out.push(heading(Math.max(1, h[1].length - shift), h[2])); i++; continue }

    // horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { flushPara(); out.push(rule()); i++; continue }

    // list item
    const li = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/)
    if (li) {
      flushPara()
      const indent = Math.floor(li[1].length / 2)
      const numbered = /\d+\./.test(li[2])
      let text = li[3]
      let checkbox = null
      const cb = text.match(/^\[([ xX])\]\s+(.*)$/)
      if (cb) { checkbox = cb[1].toLowerCase() === 'x'; text = cb[2] }
      // fold a wrapped continuation line into the same bullet
      while (i + 1 < lines.length && lines[i + 1].trim() && !/^(\s*)([-*]|\d+\.)\s+/.test(lines[i + 1]) &&
             !/^\s*[#>|]/.test(lines[i + 1]) && !/^(-{3,})$/.test(lines[i + 1].trim()) && /^\s+\S/.test(lines[i + 1])) {
        text += ' ' + lines[i + 1].trim(); i++
      }
      out.push(bullet(text, { numbered, checkbox, indent }))
      i++
      continue
    }

    // blank line ends a paragraph
    if (!trimmed) { flushPara(); i++; continue }

    paraBuf.push(trimmed)
    i++
  }
  flushPara()
  return out
}

// ---------- cover page ----------
function cover(meta) {
  const blocks = []
  blocks.push(new Paragraph({ spacing: { before: 2600, after: 0 }, children: [
    new TextRun({ text: meta.eyebrow, font: BODY, size: 20, bold: true, color: ACCENT, characterSpacing: 60 }),
  ] }))
  blocks.push(new Paragraph({
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text: meta.title, font: BODY, size: 68, bold: true, color: ACCENT_DEEP })],
  }))
  if (meta.subtitle) {
    blocks.push(new Paragraph({
      spacing: { after: 300 },
      children: [new TextRun({ text: meta.subtitle, font: BODY, size: 30, color: INK_SOFT })],
    }))
  }
  blocks.push(new Paragraph({
    spacing: { before: 120, after: 320 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 16, color: ACCENT, space: 8 } },
    children: [new TextRun({ text: '', size: 2 })],
  }))
  for (const l of meta.lines) {
    blocks.push(new Paragraph({ spacing: { after: 80 }, children: [
      new TextRun({ text: l, font: BODY, size: 22, color: INK }),
    ] }))
  }
  blocks.push(new Paragraph({ spacing: { before: 3400 }, children: [
    new TextRun({ text: meta.footer, font: BODY, size: 18, color: INK_SOFT, italics: true }),
  ] }))
  blocks.push(new Paragraph({ spacing: { after: 0 }, children: [new PageBreak()] }))
  return blocks
}

// ---------- document assembly ----------
function build(mdPath, outPath, meta) {
  let md = fs.readFileSync(mdPath, 'utf8')

  // The cover is generated, so drop the markdown title block that produced it.
  md = md.replace(/^[\s\S]*?\n---\n/, '')

  // Anchor links (#1-executive-summary) do nothing in Word — keep the label,
  // drop the link, and let Word's Navigation Pane do the actual navigating.
  md = md.replace(/\[([^\]]+)\]\(#[^)]*\)/g, '$1')

  const lines = md.split('\n')
  const body = parse(lines, headingShift(lines), CONTENT_W)

  const doc = new Document({
    creator: 'Zach Clay',
    title: meta.title,
    description: meta.subtitle || '',
    styles: {
      default: {
        document: { run: { font: BODY, size: 21, color: INK }, paragraph: { spacing: { line: 276, after: 140 } } },
      },
    },
    numbering: {
      config: [
        {
          reference: 'bulleted',
          levels: [0, 1, 2].map(l => ({
            level: l,
            format: LevelFormat.BULLET,
            text: ['●', '○', '▪'][l],
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 360 + l * 340, hanging: 240 } },
                     run: { color: l === 0 ? ACCENT : INK_SOFT } },
          })),
        },
        {
          reference: 'ordered',
          levels: [0, 1, 2].map(l => ({
            level: l,
            format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][l],
            text: `%${l + 1}.`,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 360 + l * 340, hanging: 260 } },
                     run: { bold: true, color: ACCENT } },
          })),
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H, orientation: PageOrientation.PORTRAIT },
          margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, header: 720, footer: 560 },
        },
        titlePage: true,
      },
      headers: {
        default: new Header({ children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { after: 0 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 6 } },
          children: [new TextRun({ text: meta.runningHead, font: BODY, size: 16, color: INK_SOFT, characterSpacing: 30 })],
        })] }),
        first: new Header({ children: [new Paragraph({ children: [] })] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 60 },
          children: [
            new TextRun({ text: 'Confidential   ·   ', font: BODY, size: 16, color: INK_SOFT }),
            new TextRun({ children: [PageNumber.CURRENT], font: BODY, size: 16, color: INK_SOFT }),
          ],
        })] }),
        first: new Footer({ children: [new Paragraph({ children: [] })] }),
      },
      children: [...cover(meta), ...body],
    }],
  })

  return Packer.toBuffer(doc).then(buf => {
    fs.writeFileSync(outPath, buf)
    console.log(`wrote ${outPath} (${(buf.length / 1024).toFixed(0)} KB)`)
  })
}

// ---------- run ----------
const ROOT = path.resolve(__dirname, '..')
const jobs = [
  [path.join(ROOT, 'BUSINESS_PLAN.md'), path.join(ROOT, 'Strategy Lab AI - Business Plan.docx'), {
    eyebrow: 'STRATEGY LAB AI',
    title: 'Business Plan',
    subtitle: 'The operating plan for an honest strategy-validation platform',
    lines: ['Prepared by Zach Clay, Founder', 'Version 1.0  ·  September 30, 2026', 'strategylabai.net  ·  Salem, Massachusetts'],
    footer: 'Confidential. Do not distribute without permission.',
    runningHead: 'STRATEGY LAB AI  ·  BUSINESS PLAN',
  }],
  [path.join(ROOT, 'INVESTOR_MEMORANDUM.md'), path.join(ROOT, 'Strategy Lab AI - Investor Memorandum.docx'), {
    eyebrow: 'CONFIDENTIAL',
    title: 'Investor Memorandum',
    subtitle: 'Pre-Seed Round  ·  September 2026',
    lines: ['Zach Clay, Founder', 'Salem, Massachusetts', 'strategylabai.net'],
    footer: 'Confidential. Provided to prospective investors. Do not distribute.',
    runningHead: 'STRATEGY LAB AI  ·  INVESTOR MEMORANDUM',
  }],
]

;(async () => {
  for (const [src, dst, meta] of jobs) await build(src, dst, meta)
})().catch(e => { console.error(e); process.exit(1) })
