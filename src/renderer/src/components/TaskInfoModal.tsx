import type { ReactNode } from 'react'
import { findTask, useDB, useNow } from '../store'
import { useUi } from '../ui'
import { PRIO, STATUS, baseName, fmtH } from '../utils'
import { LAUNCH_KIND } from './LaunchEditor'
import { runLaunch } from './LaunchButton'
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

      {(t.launch?.length ?? 0) > 0 && (
        <section>
          <h4>Entorno</h4>
          <div className="ti-chips">
            {t.launch!.map((i) => (
              <button key={i.id} className="chip issue" title={i.target || LAUNCH_KIND[i.kind]} onClick={() => void runLaunch(ui, t.id, i.id)}>
                {LAUNCH_KIND[i.kind]} · {i.label?.trim() || i.target.split(/[\/]/).filter(Boolean).pop() || LAUNCH_KIND[i.kind]}
              </button>
            ))}
            <button className="btn sm primary" onClick={() => void runLaunch(ui, t.id)}>
              Lanzar todo
            </button>
          </div>
        </section>
      )}

      {(t.issue || t.branch || t.pr) && (
        <section>
          <h4>Código</h4>
          <div className="ti-chips">
            {t.issue && (
              <button className="chip issue" title={t.issue.title} onClick={() => void ui.run('url:open', t.issue!.url)}>
                Issue #{t.issue.number} · {t.issue.title}
              </button>
            )}
            {t.branch && <span className="chip">⎇ {t.branch}</span>}
            {t.pr && (
              <button className="chip issue" title={t.pr.url} onClick={() => void ui.run('url:open', t.pr!.url)}>
                {t.pr.exists ? `PR #${t.pr.number}` : 'Crear PR'} → {t.pr.base}
              </button>
            )}
          </div>
        </section>
      )}

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

      {(t.sessions ?? []).length > 0 && (
        <section>
          <h4>
            Sesiones <span className="chip">{t.sessions!.length}</span>
          </h4>
          {[...t.sessions!].reverse().slice(0, 6).map((n) => (
            <div key={n.id} className="ti-session">
              <div className="ti-session-h">
                <b>{n.title}</b>
                <span className="meta">
                  {new Date(n.ts).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {n.branch ? ` · ${n.branch}` : ''}
                </span>
                <button className="icon" title="Borrar esta nota" aria-label="Borrar esta nota" onClick={() => void ui.run('session:delete', t.id, n.id)}>
                  ✕
                </button>
              </div>
              {n.done.length > 0 && (
                <ul>
                  {n.done.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              )}
              {n.decisions.length > 0 && (
                <div className="ti-sess-block">
                  <small>Decisiones</small>
                  <ul>
                    {n.decisions.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              )}
              {n.pending.length > 0 && (
                <div className="ti-sess-block">
                  <small>Pendiente</small>
                  {n.pending.map((x, i) => (
                    <div key={i} className="ti-pend">
                      <span>{x}</span>
                      <button className="btn sm" title="Agregarlo como subtarea de esta tarea" onClick={() => void ui.run('session:toSubtask', t.id, x)}>
                        → subtarea
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
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
