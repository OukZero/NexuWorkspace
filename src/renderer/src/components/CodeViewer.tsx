import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

/** Lenguaje según la extensión; se carga bajo demanda para no inflar el arranque. */
async function language(file: string): Promise<Extension | null> {
  const ext = file.toLowerCase().split('.').pop() ?? ''
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return (await import('@codemirror/lang-javascript')).javascript({ typescript: ext.startsWith('t'), jsx: ext.endsWith('x') })
    case 'json':
      return (await import('@codemirror/lang-json')).json()
    case 'css':
    case 'scss':
      return (await import('@codemirror/lang-css')).css()
    case 'html':
    case 'htm':
    case 'vue':
      return (await import('@codemirror/lang-html')).html()
    case 'md':
    case 'markdown':
      return (await import('@codemirror/lang-markdown')).markdown()
    case 'py':
      return (await import('@codemirror/lang-python')).python()
    case 'sql':
      return (await import('@codemirror/lang-sql')).sql()
    case 'xml':
    case 'csproj':
    case 'config':
    case 'svg':
    case 'xaml':
      return (await import('@codemirror/lang-xml')).xml()
    case 'java':
      return (await import('@codemirror/lang-java')).java()
    case 'c':
    case 'h':
    case 'cpp':
    case 'hpp':
      return (await import('@codemirror/lang-cpp')).cpp()
    case 'rs':
      return (await import('@codemirror/lang-rust')).rust()
    case 'cs': {
      const m = await import('@codemirror/legacy-modes/mode/clike')
      return StreamLanguage.define(m.csharp)
    }
    case 'go': {
      const m = await import('@codemirror/legacy-modes/mode/go')
      return StreamLanguage.define(m.go)
    }
    case 'yml':
    case 'yaml': {
      const m = await import('@codemirror/legacy-modes/mode/yaml')
      return StreamLanguage.define(m.yaml)
    }
    case 'sh':
    case 'bash': {
      const m = await import('@codemirror/legacy-modes/mode/shell')
      return StreamLanguage.define(m.shell)
    }
    case 'ps1':
    case 'psm1': {
      const m = await import('@codemirror/legacy-modes/mode/powershell')
      return StreamLanguage.define(m.powerShell)
    }
    case 'toml': {
      const m = await import('@codemirror/legacy-modes/mode/toml')
      return StreamLanguage.define(m.toml)
    }
    default:
      return null
  }
}

// colores del resaltado: salen de las variables del tema, así que siguen el modo claro/oscuro y los temas
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword], color: 'var(--syn-kw, var(--accent))', fontWeight: '600' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--syn-str, var(--accent2))' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syn-num, var(--warn))' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--syn-com, var(--muted))', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.variableName)], color: 'var(--syn-fn, #58a6ff)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--syn-type, #e0a3ff)' },
  { tag: [t.tagName, t.heading], color: 'var(--syn-tag, var(--danger))' },
  { tag: [t.attributeName, t.propertyName], color: 'var(--syn-attr, #79c0ff)' },
  { tag: [t.meta, t.punctuation, t.bracket], color: 'var(--muted)' },
  { tag: t.link, color: 'var(--accent)', textDecoration: 'underline' }
])

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--text)', fontSize: '12.5px' },
  '.cm-scroller': { fontFamily: 'var(--font-code, Consolas, "Cascadia Code", monospace)', lineHeight: '1.55' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--muted)', border: 'none', opacity: '.7' },
  '.cm-content': { caretColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' }
})

/** Visor de código de solo lectura con numeración y resaltado de sintaxis. `line` desplaza hasta esa línea. */
export function CodeViewer({ text, file, line }: { text: string; file: string; line?: number }): ReactNode {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    let view: EditorView | null = null
    let dead = false
    void language(file).then((lang) => {
      if (dead || !host.current) return
      view = new EditorView({
        parent: host.current,
        state: EditorState.create({
          doc: text,
          extensions: [lineNumbers(), EditorState.readOnly.of(true), EditorView.editable.of(false), syntaxHighlighting(highlight), theme, ...(lang ? [lang] : [])]
        })
      })
      if (line && line > 0 && line <= view.state.doc.lines) {
        view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(line).from, { y: 'center' }) })
      }
    })
    return () => {
      dead = true
      view?.destroy()
    }
  }, [text, file, line])

  return <div className="code-host" ref={host} />
}
