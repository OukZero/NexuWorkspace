import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Note } from '../../../shared/types'
import { NOTE_TEMPLATES, deleteNote, saveNote, takeNoteRequest, useNotes } from '../notes'
import { useDB } from '../store'
import { useUi } from '../ui'
import { isWorkTask } from '../utils'
import { G } from './glyphs'
import { Markdown } from './Markdown'
import { Select } from './Select'

const when = (ts: number): string => {
  const d = new Date(ts)
  const today = new Date()
  return d.toDateString() === today.toDateString() ? d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

const preview = (n: Note): string => n.body.replace(/[#>*`\-\n]+/g, ' ').trim().slice(0, 90)

/** Editor de una nota: se guarda solo poco después de dejar de escribir y al cambiar de nota. */
function Editor({ note, onDeleted }: { note: Note; onDeleted: () => void }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [tags, setTags] = useState(note.tags.join(', '))
  const [taskId, setTaskId] = useState(note.taskId ?? '')
  const [pinned, setPinned] = useState(!!note.pinned)
  const [reading, setReading] = useState(false)
  const [saved, setSaved] = useState(true)
  const draft = useRef({ title, body, tags, taskId, pinned })
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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

  return (
    <div className="nt-ed">
      <div className="nt-bar">
        <input
          className="nt-title"
          value={title}
          placeholder="Título"
          aria-label="Título de la nota"
          maxLength={120}
          onChange={(e) => {
            setTitle(e.target.value)
            change({ title: e.target.value })
          }}
        />
        <button
          className={`ib ${pinned ? 'on' : ''}`}
          title={pinned ? 'Quitar de las ancladas' : 'Anclar arriba'}
          aria-label={pinned ? 'Quitar de las ancladas' : 'Anclar la nota'}
          aria-pressed={pinned}
          onClick={() => {
            setPinned(!pinned)
            change({ pinned: !pinned })
          }}
        >
          ★
        </button>
        <div className="seg">
          <button className={!reading ? 'on' : ''} onClick={() => setReading(false)}>
            Editar
          </button>
          <button className={reading ? 'on' : ''} onClick={() => setReading(true)}>
            Vista
          </button>
        </div>
        <button className="ib" title="Eliminar nota" aria-label="Eliminar nota" onClick={() => void remove()}>
          <G n="x" size={16} />
        </button>
      </div>
      <div className="nt-meta">
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
        <span className="nt-state">{saved ? 'Guardado' : 'Guardando…'}</span>
      </div>
      {reading ? (
        <div className="nt-prev">{body.trim() ? <Markdown text={body} /> : <div className="meta">Nota vacía.</div>}</div>
      ) : (
        <textarea
          className="nt-body"
          value={body}
          placeholder="Escribe en Markdown: # títulos, - listas, **negrita**, `código`…"
          aria-label="Contenido de la nota"
          spellCheck
          onChange={(e) => {
            setBody(e.target.value)
            change({ body: e.target.value })
          }}
          onBlur={flush}
        />
      )}
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
          <input value={q} placeholder="Buscar en las notas…" aria-label="Buscar en las notas" onChange={(e) => setQ(e.target.value)} />
          <div className="nt-new">
            <button className="btn sm primary" onClick={() => void create()}>
              <G n="plus" size={14} /> Nueva
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
              <span className="nt-it">
                {n.pinned && <b className="nt-pin">★</b>}
                {n.title}
              </span>
              <span className="nt-ip">{preview(n) || 'Nota vacía'}</span>
              <span className="nt-im">
                {when(n.updatedAt)}
                {taskName(n.taskId) && ` · ${taskName(n.taskId)}`}
              </span>
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
