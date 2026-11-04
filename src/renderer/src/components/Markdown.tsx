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

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g

function Inline({ text }: { text: string }): ReactNode {
  return (
    <>
      {text.split(INLINE).map((p, i) => {
        if (p.startsWith('`') && p.endsWith('`') && p.length > 2) return <code key={i}>{p.slice(1, -1)}</code>
        if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <b key={i}>{p.slice(2, -2)}</b>
        return <Fragment key={i}>{p}</Fragment>
      })}
    </>
  )
}

/** Markdown mínimo: bloques ```código```, `código` en línea y **negrita**. Sin HTML crudo, así que no hay XSS. */
export function Markdown({ text }: { text: string }): ReactNode {
  return (
    <>
      {text.split('```').map((part, i) => {
        if (i % 2) return <CodeBlock key={i} code={part.replace(/^[\w-]*\n/, '')} />
        return (
          <Fragment key={i}>
            {part.split('\n').map((line, j, arr) => (
              <Fragment key={j}>
                <Inline text={line} />
                {j < arr.length - 1 && <br />}
              </Fragment>
            ))}
          </Fragment>
        )
      })}
    </>
  )
}
