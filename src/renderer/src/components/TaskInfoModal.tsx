import type { ReactNode } from 'react'
import { findTask, useDB, useNow } from '../store'
import { useUi } from '../ui'
import { PRIO, STATUS, baseName, fmtH } from '../utils'
import { Markdown } from './Markdown'

/** Ficha de solo lectura de una tarea: todo lo que se sabe de ella sin entrar a «Editar». */
export function TaskInfoModal({ taskId }: { taskId: string }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const now = useNow(30000)
  const t = findTask(db, taskId)
  if (!t) return null

  const spentMs = db.entries.filter((e) => e.taskId === t.id).reduce((a, e) => a + ((e.end ?? now) - e.start), 0)
  const estMs = t.estimateMin * 60000
  const subs = t.subtasks ?? []
  const done = subs.filter((s) => s.done).length
  const groups = (t.groupIds ?? []).map((id) => db.groups.find((g) => g.id === id)?.name).filter(Boolean)
  const toggle = (id: string): void => void ui.run('task:save', { id: t.id, subtasks: subs.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) })

  return (
    <div className="dialog wide taskinfo">
      <div className="ti-head">
        <div className="grow">
          <h2>{t.title}</h2>
          <div className="ti-chips">
            <span className={`chip st-${t.status}`}>{STATUS[t.status]}</span>
            <span className="chip">Prioridad {PRIO[t.priority].toLowerCase()}</span>
            {t.client && <span className="chip">{t.client}</span>}
            {t.project && <span className="chip">{t.project}</span>}
            {(t.tags ?? []).map((g) => (
              <span key={g} className="chip">
                #{g}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="ti-stats">
        <div>
          <small>Tiempo registrado</small>
          <b>{fmtH(spentMs)} h</b>
        </div>
        <div>
          <small>Estimado</small>
          <b>{t.estimateMin ? `${fmtH(estMs)} h` : '—'}</b>
          {t.estimateMin > 0 && (
            <div className="bar">
              <i style={{ width: `${Math.min(100, (spentMs / estMs) * 100)}%`, background: spentMs > estMs ? 'var(--danger)' : undefined }} />
            </div>
          )}
        </div>
        <div>
          <small>Redmine</small>
          <b className="ti-small">{t.rmProject && t.rmIssue ? t.rmIssue : 'Sin asignar'}</b>
          {t.rmProject && <small title={t.rmProject}>{t.rmProject}</small>}
        </div>
      </div>

      {t.description.trim() && (
        <section>
          <h4>Descripción</h4>
          <div className="ti-text">
            <Markdown text={t.description} />
          </div>
        </section>
      )}

      {subs.length > 0 && (
        <section>
          <h4>
            Subtareas <span className="chip">{done}/{subs.length}</span>
          </h4>
          {subs.map((s) => (
            <label key={s.id} className={`ti-sub ${s.done ? 'done' : ''}`}>
              <input type="checkbox" checked={s.done} onChange={() => toggle(s.id)} />
              <span>{s.text}</span>
            </label>
          ))}
        </section>
      )}

      {t.notes?.trim() && (
        <section>
          <h4>Notas</h4>
          <div className="ti-text">
            <Markdown text={t.notes} />
          </div>
        </section>
      )}

      {t.workDone?.trim() && (
        <section>
          <h4>Lo realizado</h4>
          <div className="ti-text">
            <Markdown text={t.workDone} />
          </div>
        </section>
      )}

      <section>
        <h4>Carpetas</h4>
        <div className="meta" title={t.folder}>
          📁 {t.folder ? `${baseName(t.folder)} · ${t.folder}` : 'Sin carpeta propia'}
        </div>
        {groups.length > 0 && <div className="meta">🗂 Grupos: {groups.join(', ')}</div>}
      </section>

      {(t.log ?? []).length > 0 && (
        <section>
          <h4>Historial de resúmenes</h4>
          {[...(t.log ?? [])].reverse().slice(0, 5).map((l, i) => (
            <div key={i} className="commit" style={{ marginBottom: 6 }}>
              {new Date(l.ts).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {l.text}
            </div>
          ))}
        </section>
      )}

      <div className="foot">
        <span className="sp" />
        <button className="btn" onClick={ui.closeModal}>
          Cerrar
        </button>
        <button className="btn primary" onClick={() => ui.editTask(t)}>
          Editar
        </button>
      </div>
    </div>
  )
}
