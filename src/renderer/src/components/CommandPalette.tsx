import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { convLabel, openConvs } from '../conversations'
import { findTask, useDB } from '../store'
import { PRESETS, getFocus, setFocusMode, setPreset, toggleDayNight } from '../theme'
import { applyPreset, savedLayouts } from '../layout'
import { showSettingsTab } from './SettingsView'
import { isWorkTask } from '../utils'
import { useUi, type View } from '../ui'
import { toggleFullscreen } from '../fullscreen'
import { requestNote, useNotes } from '../notes'
import { requestWeb } from '../webTabs'
import { runLaunch } from './LaunchButton'

interface Item {
  id: string
  group: string
  label: string
  hint?: string
  run: () => void
}

const VIEWS: Array<[View, string]> = [
  ['today', 'Inicio'],
  ['board', 'Tablero'],
  ['workspace', 'Espacio de trabajo (paneles divididos)'],
  ['hours', 'Horas'],
  ['history', 'Historial'],
  ['redmine', 'Redmine · horas imputadas'],
  ['dashboard', 'Productividad (dashboard)'],
  ['usage', 'Consumo'],
  ['groups', 'Carpetas'],
  ['notes', 'Notas'],
  ['meetings', 'Reuniones (grabar y resumir)'],
  ['arch', 'Arquitectura (diseñar con Claude)'],
  ['diagrams', 'Diagramas (BPMN, flujo, UML, ER)'],
  ['web', 'Web (pestañas y sitios guardados)'],
  ['music', 'Música (Spotify)'],
  ['settings', 'Ajustes']
]

/** Búsqueda global (Ctrl+K): vistas, acciones, tareas y conversaciones. */
export function CommandPalette({ onClose }: { onClose: () => void }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const current = findTask(db, ui.activeTask)
  const notes = useNotes()

  const items = useMemo<Item[]>(() => {
    const go = (fn: () => void) => (): void => {
      onClose()
      fn()
    }
    const out: Item[] = [
      { id: 'a-new', group: 'Acciones', label: 'Nueva tarea', hint: 'Crear una tarea detallada', run: go(() => ui.editTask({})) },
      { id: 'a-help', group: 'Acciones', label: 'Ver atajos de teclado', hint: 'Ctrl+/', run: go(ui.openHelp) },
      { id: 'a-theme', group: 'Acciones', label: 'Alternar tema día / noche', run: go(toggleDayNight) },
      { id: 'a-focus', group: 'Acciones', label: 'Modo foco: ocultar menú y pestañas', hint: 'Ctrl+Mayús+F', run: go(() => setFocusMode(!getFocus())) },
      { id: 'a-look', group: 'Acciones', label: 'Personalizar apariencia…', hint: 'Temas, colores, tipografía, menú', run: go(() => { showSettingsTab('apariencia'); ui.go('settings') }) },
      ...savedLayouts().map((p) => ({ id: 'l-' + p.id, group: 'Acciones', label: `Disposición: ${p.name}`, hint: 'Paneles, terminal y modo foco', run: go(() => applyPreset(p)) })),
      { id: 'a-full', group: 'Acciones', label: 'Pantalla completa', hint: 'F11', run: go(() => void toggleFullscreen()) },
      { id: 'a-skills', group: 'Acciones', label: 'Abrir catálogo de skills', run: go(() => void window.api.call('window:skills')) },
      { id: 'a-assist', group: 'Acciones', label: 'Asistente: pídele algo con texto', hint: 'Ctrl+J', run: go(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true }))) },
      { id: 'a-note', group: 'Acciones', label: 'Nueva nota', run: go(() => { requestNote({ newForTask: '' }); ui.go('notes') }) },
      { id: 'a-wsp', group: 'Acciones', label: 'Abrir WhatsApp', run: go(() => ui.go('whatsapp')) },
      { id: 'a-random', group: 'Acciones', label: 'Probar un tema al azar', run: go(() => { const k = Object.keys(PRESETS); setPreset(k[Math.floor(Math.random() * k.length)]) }) },
      { id: 'a-export', group: 'Acciones', label: 'Exportar datos (.json)', run: go(() => void ui.run('data:export')) }
    ]
    if (current) {
      out.push(
        { id: 'a-conv', group: 'Acciones', label: `Nueva conversación en «${current.title}»`, run: go(() => ui.newConversation(current.id)) },
        { id: 'a-term', group: 'Acciones', label: `Abrir terminal en «${current.title}»`, hint: current.folder, run: go(() => ui.openTerminal(current.id)) },
        { id: 'a-tnote', group: 'Acciones', label: `Nueva nota para «${current.title}»`, run: go(() => { requestNote({ newForTask: current.id, title: current.title }); ui.go('notes') }) },
        ...(current.launch?.length ? [{ id: 'a-launch', group: 'Acciones', label: `Lanzar el entorno de «${current.title}»`, hint: `${current.launch.length} elementos`, run: go(() => void runLaunch(ui, current.id)) }] : []),
        { id: 'a-code', group: 'Acciones', label: `Abrir «${current.title}» en VS Code`, hint: current.folder, run: go(() => void ui.run('vscode:open', current.folder)) }
      )
    }
    for (const [v, label] of VIEWS) out.push({ id: `v-${v}`, group: 'Ir a', label, run: go(() => ui.go(v)) })
    for (const t of db.tasks.filter((x) => isWorkTask(x) && x.status !== 'done')) {
      out.push({ id: `t-${t.id}`, group: 'Tareas', label: t.title, hint: [t.client, t.project].filter(Boolean).join(' · '), run: go(() => ui.openTask(t)) })
    }
    for (const t of db.tasks.filter(isWorkTask)) {
      for (const c of openConvs(db, t.id)) {
        if (c.chat.messages.length) out.push({ id: `c-${c.id}`, group: 'Conversaciones', label: convLabel(c.chat), hint: t.title, run: go(() => ui.openChat(t.id, c.id)) })
      }
    }
    for (const l of db.settings.webLinks ?? []) out.push({ id: `w-${l.id}`, group: 'Web', label: l.name, hint: l.url, run: go(() => { requestWeb(l.url); ui.go('web') }) })
    for (const n of notes) out.push({ id: `n-${n.id}`, group: 'Notas', label: n.title, hint: n.tags.map((t) => '#' + t).join(' ') || n.body.replace(/\s+/g, ' ').slice(0, 60), run: go(() => { requestNote({ id: n.id }); ui.go('notes') }) })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, current?.id, notes])

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    const hits = items.filter((i) => words.every((w) => `${i.label} ${i.hint ?? ''} ${i.group}`.toLowerCase().includes(w)))
    return hits.slice(0, 40)
  }, [items, q])

  useEffect(() => setIdx(0), [q])
  useEffect(() => {
    list.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' })
  }, [idx])

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIdx((i) => Math.min(shown.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIdx((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      shown[idx]?.run()
    }
  }

  let lastGroup = ''
  return (
    <div className="dialog palette" role="dialog" aria-label="Búsqueda global" onKeyDown={onKey}>
      <input autoFocus value={q} placeholder="Busca tareas, conversaciones, vistas o acciones…" aria-label="Buscar" onChange={(e) => setQ(e.target.value)} />
      <div className="plist" ref={list} role="listbox">
        {shown.map((it, i) => {
          const head = it.group !== lastGroup ? <div className="pgroup">{it.group}</div> : null
          lastGroup = it.group
          return (
            <div key={it.id}>
              {head}
              <button className={`pitem ${i === idx ? 'on' : ''}`} role="option" aria-selected={i === idx} onMouseEnter={() => setIdx(i)} onClick={it.run}>
                <span>{it.label}</span>
                {it.hint && <small>{it.hint}</small>}
              </button>
            </div>
          )
        })}
        {!shown.length && <div className="meta" style={{ padding: 12 }}>Sin resultados.</div>}
      </div>
      <div className="meta">↑↓ navegar · Enter abrir · Esc cerrar</div>
    </div>
  )
}
