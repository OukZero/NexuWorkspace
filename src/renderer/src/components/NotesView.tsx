import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, ReactNode } from 'react'
import type { Note } from '../../../shared/types'
import { NOTE_TEMPLATES, deleteNote, saveNote, takeNoteRequest, useNotes } from '../notes'
import { useDB } from '../store'
import { useUi } from '../ui'
import { isWorkTask } from '../utils'
import { G } from './glyphs'
import { Markdown } from './Markdown'
import { Menu } from './Menu'
import { Select } from './Select'

/** «8 nov · 14:54»: día y hora de la última modificación. */
const when = (ts: number): string => {
  const d = new Date(ts)
  const day = d.toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '')
  const hm = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === new Date().toDateString() ? `Hoy · ${hm}` : `${day} · ${hm}`
}

const preview = (n: Note): string => n.body.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/[#>*`\-\n]+/g, ' ').trim().slice(0, 90)

/** Trozos de la nota: en posición par va el texto y en posición impar, una imagen pegada (sintaxis Markdown). */
const IMG_MD = /(!\[[^\]\n]*\]\(shutoki-note:\/\/[^)\s]+\))/
const splitBody = (s: string): string[] => s.split(IMG_MD)
const urlOf = (md: string): string => /\((shutoki-note:[^)\s]+)\)/.exec(md)?.[1] ?? ''

/** Editor de una nota: se guarda solo poco después de dejar de escribir y al cambiar de nota. */
function Editor({ note, onDeleted }: { note: Note; onDeleted: () => void }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [tags, setTags] = useState(note.tags.join(', '))
  const [taskId, setTaskId] = useState(note.taskId ?? '')
  const [pinned, setPinned] = useState(!!note.pinned)
  // escribir (texto con las imágenes como miniaturas), dividido (editor + vista previa) o solo vista previa
  const [view, setView] = useState<'write' | 'split' | 'read'>('write')
  const [saved, setSaved] = useState(true)
  const draft = useRef({ title, body, tags, taskId, pinned })
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const area = useRef<HTMLTextAreaElement | null>(null) // el trozo de texto que tiene el foco (para el formato)
  const taRefs = useRef<Array<HTMLTextAreaElement | null>>([])
  const pendingCaret = useRef<{ idx: number; pos: number } | null>(null)
  const bodyRef = useRef(body)
  bodyRef.current = body
  const parts = splitBody(body)

  const flush = (): void => {
    clearTimeout(timer.current)
    if (!dirty.current) return
    dirty.current = false
    const d = draft.current
    void saveNote({ id: note.id, title: d.title, body: d.body, tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean), taskId: d.taskId || null, pinned: d.pinned })
      .then(() => setSaved(true))
      .catch((e: Error) => ui.toast(`No se pudo guardar la nota: ${e.message}`, true))
  }
  const change = (patch: Partial<typeof draft.current>): void => {
    draft.current = { ...draft.current, ...patch }
    dirty.current = true
    setSaved(false)
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 700)
  }
  // al cambiar de nota o salir de la vista se guarda lo pendiente
  useEffect(() => flush, []) // eslint-disable-line react-hooks/exhaustive-deps

  const tasks = db.tasks.filter((t) => isWorkTask(t) && (t.status !== 'done' || t.id === taskId))
  const remove = async (): Promise<void> => {
    if (!(await ui.confirm(`¿Eliminar la nota «${title || 'Sin título'}»? No se puede deshacer.`, { title: 'Eliminar nota', confirmLabel: 'Eliminar', danger: true }))) return
    dirty.current = false
    clearTimeout(timer.current)
    await deleteNote(note.id)
    onDeleted()
  }
  const togglePin = (): void => {
    setPinned(!pinned)
    change({ pinned: !pinned })
  }

  const commitBody = (next: string): void => {
    setBody(next)
    change({ body: next })
  }
  const setPart = (i: number, v: string): void => {
    const next = splitBody(bodyRef.current)
    next[i] = v
    commitBody(next.join(''))
  }
  const removePart = (i: number): void => {
    const next = splitBody(bodyRef.current)
    next.splice(i - 1, 3, next[i - 1] + next[i + 1]) // une el texto de antes y el de después de la imagen
    commitBody(next.join(''))
  }
  // tras pegar una imagen, el cursor queda en el texto que va después de ella
  useEffect(() => {
    const c = pendingCaret.current
    if (!c) return
    pendingCaret.current = null
    const el = taRefs.current[c.idx]
    if (el) {
      el.focus()
      el.setSelectionRange(c.pos, c.pos)
    }
  }, [body])

  // pegar una imagen del portapapeles: se guarda con la nota y aparece como miniatura en ese punto del texto
  const pasteImage = async (e: ClipboardEvent<HTMLTextAreaElement>, i: number): Promise<void> => {
    const item = Array.from(e.clipboardData.items).find((x) => x.kind === 'file' && x.type.startsWith('image/'))
    const file = item?.getAsFile()
    if (!file) return // texto normal: lo pega el navegador
    e.preventDefault()
    const el = e.currentTarget
    const start = el.selectionStart
    const end = el.selectionEnd
    const before = el.value
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
        r.onerror = () => reject(r.error)
        r.readAsDataURL(file)
      })
      const url = await window.api.call('notes:image', note.id, file.type, data)
      const ins = '\n![imagen](' + url + ')\n'
      const next = splitBody(bodyRef.current)
      // si mientras se guardaba la imagen se escribió en ese trozo, la imagen va al final de lo que haya
      next[i] = next[i] === before ? before.slice(0, start) + ins + before.slice(end) : next[i] + ins
      pendingCaret.current = { idx: i + 2, pos: 0 }
      commitBody(next.join(''))
    } catch (err) {
      ui.toast('No se pudo pegar la imagen: ' + (err as Error).message, true)
    }
  }

  // formato: inserta la sintaxis Markdown en la selección del cuadro de texto
  const edit = (fn: (v: string, s: number, e: number) => { text: string; start: number; end: number }): void => {
    const el = area.current
    if (!el) return
    const r = fn(el.value, el.selectionStart, el.selectionEnd)
    const idx = taRefs.current.indexOf(el)
    if (idx < 0 || idx % 2 !== 0) return
    const next = splitBody(bodyRef.current)
    next[idx] = r.text
    commitBody(next.join(''))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(r.start, r.end)
    })
  }
  const wrap = (a: string, b: string, placeholder: string): void =>
    edit((v, s, e) => {
      const sel = v.slice(s, e) || placeholder
      return { text: v.slice(0, s) + a + sel + b + v.slice(e), start: s + a.length, end: s + a.length + sel.length }
    })
  const bullets = (): void =>
    edit((v, s, e) => {
      const ls = v.lastIndexOf('\n', s - 1) + 1
      const block = v.slice(ls, e)
      const out = block.split('\n').map((l) => (l.startsWith('- ') ? l : `- ${l}`)).join('\n')
      return { text: v.slice(0, ls) + out + v.slice(e), start: s + 2, end: e + (out.length - block.length) }
    })
  const link = (): void =>
    edit((v, s, e) => {
      const sel = v.slice(s, e) || 'texto'
      const at = s + sel.length + 3
      return { text: `${v.slice(0, s)}[${sel}](https://)${v.slice(e)}`, start: at, end: at + 8 }
    })

  const tools: Array<[string, 'bold' | 'italic' | 'bullets' | 'code' | 'link', () => void]> = [
    ['Negrita', 'bold', () => wrap('**', '**', 'texto')],
    ['Cursiva', 'italic', () => wrap('*', '*', 'texto')],
    ['Lista', 'bullets', bullets],
    ['Código', 'code', () => wrap('`', '`', 'código')],
    ['Enlace', 'link', link]
  ]

  return (
    <div className="editor">
      <div className="ed-tools">
        {tools.map(([label, icon, run]) => (
          <button key={label} title={label} aria-label={label} disabled={view === 'read'} onClick={run}>
            <G n={icon} size={15} />
          </button>
        ))}
        <span className="sp" />
        <div className="ed-view" role="group" aria-label="Modo de vista">
          {(
            [
              ['write', 'Escribir'],
              ['split', 'Dividido'],
              ['read', 'Vista previa']
            ] as const
          ).map(([v, label]) => (
            <button key={v} className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>
              {label}
            </button>
          ))}
        </div>
        <span className="chip">Markdown</span>
        <span className={`chip ${saved ? 'ok' : 'prio'}`} role="status">
          {saved ? 'Guardado' : 'Guardando…'}
        </span>
        <Menu
          trigger={<G n="more" size={16} />}
          className="ed-more"
          title="Más acciones"
          items={[
            { label: pinned ? 'Quitar de las ancladas' : 'Anclar arriba', icon: '★', onSelect: togglePin },
            { kind: 'sep' },
            { label: 'Eliminar nota', icon: '✕', danger: true, onSelect: () => void remove() }
          ]}
        />
      </div>
      <div className="ed-body">
        <input
          className="ed-title"
          value={title}
          placeholder="Título"
          aria-label="Título de la nota"
          maxLength={120}
          onChange={(e) => {
            setTitle(e.target.value)
            change({ title: e.target.value })
          }}
        />
        <div className="ed-meta">
          <Select
            className="nt-task"
            value={taskId}
            ariaLabel="Tarea vinculada"
            searchable
            options={[{ value: '', label: 'Sin tarea' }, ...tasks.map((t) => ({ value: t.id, label: t.title }))]}
            onChange={(v) => {
              setTaskId(v)
              change({ taskId: v })
            }}
          />
          <input
            className="nt-tags"
            value={tags}
            placeholder="Etiquetas separadas por comas"
            aria-label="Etiquetas"
            onChange={(e) => {
              setTags(e.target.value)
              change({ tags: e.target.value })
            }}
          />
        </div>
        <div className={`ed-views ${view}`}>
          {view !== 'read' && (
            <div className="ed-blocks">
              {parts.map((p, i) =>
                i % 2 === 1 ? (
                  <figure key={'i' + i} className="ed-img">
                    <img src={urlOf(p)} alt="Imagen de la nota" />
                    <button type="button" className="ed-img-x" title="Quitar imagen" aria-label="Quitar imagen" onClick={() => removePart(i)}>
                      ×
                    </button>
                  </figure>
                ) : (
                  <textarea
                    key={'t' + i}
                    ref={(el) => {
                      taRefs.current[i] = el
                    }}
                    className="nt-body nt-seg"
                    value={p}
                    rows={Math.min(20, Math.max(1, p.split('\n').length))}
                    placeholder={parts.length === 1 ? 'Escribe en Markdown: # títulos, - listas, **negrita**, `código`…  Pega una imagen con Ctrl+V' : undefined}
                    aria-label="Contenido de la nota"
                    spellCheck
                    onFocus={(e) => {
                      area.current = e.currentTarget
                    }}
                    onChange={(e) => setPart(i, e.target.value)}
                    onPaste={(e) => void pasteImage(e, i)}
                    onBlur={flush}
                  />
                )
              )}
            </div>
          )}
          {view !== 'write' && <div className="nt-prev">{body.trim() ? <Markdown text={body} /> : <div className="meta">Nota vacía.</div>}</div>}
        </div>
      </div>
    </div>
  )
}

/** Vista «Notas»: lista con búsqueda y etiquetas, y editor Markdown. Todo se guarda en archivos locales. */
export function NotesView(): ReactNode {
  const notes = useNotes()
  const db = useDB()
  const ui = useUi()
  const [sel, setSel] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')
  const [menu, setMenu] = useState(false)

  const create = async (template = NOTE_TEMPLATES[0], taskId?: string, title?: string, body?: string): Promise<void> => {
    try {
      const n = await saveNote({ title: title ?? template.title, body: body ?? template.body, taskId: taskId ?? null })
      setSel(n.id)
      setQ('')
      setTag('')
    } catch (e) {
      ui.toast(`No se pudo crear la nota: ${(e as Error).message}`, true)
    }
  }

  // peticiones de otras vistas (abrir una nota, crear una para una tarea)
  useEffect(() => {
    const r = takeNoteRequest()
    if (!r) return
    if (r.id) setSel(r.id)
    else if (r.newForTask !== undefined) void create(NOTE_TEMPLATES[0], r.newForTask || undefined, r.title, r.body)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const allTags = useMemo(() => [...new Set(notes.flatMap((n) => n.tags))].sort(), [notes])
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return notes.filter((n) => (!tag || n.tags.includes(tag)) && words.every((w) => `${n.title} ${n.body} ${n.tags.join(' ')}`.toLowerCase().includes(w)))
  }, [notes, q, tag])
  const cur = notes.find((n) => n.id === sel) ?? null
  const taskName = (id?: string): string => (id ? (db.tasks.find((t) => t.id === id)?.title ?? '') : '')

  return (
    <div className="notes">
      <aside className="nt-list" aria-label="Notas">
        <div className="nt-top">
          <label className="nt-search">
            <G n="search" size={13} />
            <input value={q} placeholder="Buscar notas…" aria-label="Buscar en las notas" onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="nt-new">
            <button className="btn sm p" onClick={() => void create()}>
              <G n="plus" size={13} /> Nueva
            </button>
            <button className="ib" title="Nueva desde plantilla" aria-label="Nueva nota desde plantilla" aria-expanded={menu} onClick={() => setMenu(!menu)}>
              <G n="chevron" size={14} />
            </button>
            {menu && (
              <div className="nt-menu" role="menu">
                {NOTE_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    role="menuitem"
                    onClick={() => {
                      setMenu(false)
                      void create(t)
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {allTags.length > 0 && (
          <div className="nt-tagrow">
            {allTags.map((t) => (
              <button key={t} className={`chip ${tag === t ? 'on' : ''}`} aria-pressed={tag === t} onClick={() => setTag(tag === t ? '' : t)}>
                #{t}
              </button>
            ))}
          </div>
        )}
        <div className="nt-items">
          {shown.map((n) => (
            <button key={n.id} className={`nt-item ${sel === n.id ? 'on' : ''}`} onClick={() => setSel(n.id)}>
              <b className="nt-it">
                {n.pinned && <span className="nt-pin">★</span>}
                {n.title || 'Sin título'}
              </b>
              <small className="nt-im">
                {preview(n) ? when(n.updatedAt) : `Nota vacía · ${when(n.updatedAt).split(' · ')[1]}`}
                {taskName(n.taskId) && ` · ${taskName(n.taskId)}`}
              </small>
              <span className="nt-ip">{preview(n) || ' '}</span>
            </button>
          ))}
          {!shown.length && <div className="nt-empty">{notes.length ? 'Ninguna nota coincide.' : 'Aún no tienes notas. Crea la primera con «Nueva».'}</div>}
        </div>
      </aside>
      <section className="nt-main">
        {cur ? (
          <Editor key={cur.id} note={cur} onDeleted={() => setSel(null)} />
        ) : (
          <div className="nt-empty big">
            <G n="files" size={34} stroke={1.3} />
            <div>Elige una nota o crea una nueva.</div>
            <div className="meta">Se guardan como archivos Markdown en tu equipo.</div>
          </div>
        )}
      </section>
    </div>
  )
}
