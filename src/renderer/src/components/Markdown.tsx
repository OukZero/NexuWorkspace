import { Fragment, useState } from 'react'
import type { ReactNode } from 'react'

function CodeBlock({ code }: { code: string }): ReactNode {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* sin permiso de portapapeles */
    }
  }
  return (
    <pre>
      <button className="copy" onClick={copy}>
        {copied ? '¡Copiado!' : 'Copiar'}
      </button>
      {code}
    </pre>
  )
}

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g

function Inline({ text }: { text: string }): ReactNode {
  return (
    <>
      {text.split(INLINE).map((p, i) => {
        if (p.startsWith('`') && p.endsWith('`') && p.length > 2) return <code key={i}>{p.slice(1, -1)}</code>
        if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <b key={i}>{p.slice(2, -2)}</b>
        const a = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(p)
        if (a)
          return (
            <a key={i} href={a[2]} target="_blank" rel="noreferrer noopener">
              {a[1]}
            </a>
          )
        return <Fragment key={i}>{p}</Fragment>
      })}
    </>
  )
}

const UL = /^\s*[-*•]\s+(.*)$/
const OL = /^\s*(\d+)[.)]\s+(.*)$/
const HEAD = /^(#{1,4})\s+(.*)$/
const QUOTE = /^\s*>/

function Lines({ lines }: { lines: string[] }): ReactNode {
  return (
    <>
      {lines.map((t, j) => (
        <Fragment key={j}>
          {j > 0 && <br />}
          <Inline text={t} />
        </Fragment>
      ))}
    </>
  )
}

/** Bloques de texto: títulos, listas, citas, separadores y párrafos. Sin HTML crudo, así que no hay XSS. */
function Blocks({ text }: { text: string }): ReactNode {
  const lines = text.split('\n')
  const out: ReactNode[] = []
  let k = 0
  let i = 0
  while (i < lines.length) {
    const ln = lines[i]
    if (!ln.trim()) {
      i++
      continue
    }
    const h = HEAD.exec(ln)
    if (h) {
      out.push(
        <div key={k++} className={`md-h md-h${h[1].length}`} role="heading" aria-level={h[1].length + 1}>
          <Inline text={h[2]} />
        </div>
      )
      i++
      continue
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(ln)) {
      out.push(<hr key={k++} />)
      i++
      continue
    }
    if (UL.test(ln) || OL.test(ln)) {
      const ordered = OL.test(ln)
      const items: string[] = []
      while (i < lines.length && (ordered ? OL.test(lines[i]) : UL.test(lines[i]))) {
        const m = (ordered ? OL.exec(lines[i]) : UL.exec(lines[i])) as RegExpExecArray
        items.push(m[m.length - 1])
        i++
      }
      const Tag = ordered ? 'ol' : 'ul'
      out.push(
        <Tag key={k++}>
          {items.map((t, j) => (
            <li key={j}>
              <Inline text={t} />
            </li>
          ))}
        </Tag>
      )
      continue
    }
    if (QUOTE.test(ln)) {
      const q: string[] = []
      while (i < lines.length && QUOTE.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''))
      out.push(
        <blockquote key={k++}>
          <Lines lines={q} />
        </blockquote>
      )
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !HEAD.test(lines[i]) && !UL.test(lines[i]) && !OL.test(lines[i]) && !QUOTE.test(lines[i])) para.push(lines[i++])
    out.push(
      <p key={k++}>
        <Lines lines={para} />
      </p>
    )
  }
  return <>{out}</>
}

/** Markdown mínimo: bloques ```código```, títulos, listas, citas, enlaces, `código` en línea y **negrita**. */
export function Markdown({ text }: { text: string }): ReactNode {
  return (
    <div className="md">
      {text.split('```').map((part, i) => (i % 2 ? <CodeBlock key={i} code={part.replace(/^[\w-]*\n/, '')} /> : <Blocks key={i} text={part} />))}
    </div>
  )
}
