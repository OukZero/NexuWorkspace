// Barras y botones de seguridad del chat: copia aislada, aviso de límite de la cuenta, pruebas del proyecto y perfiles.
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { CheckDef, CheckResult } from '../../../shared/types'
import { profilesOf } from '../../../shared/templates'
import { useDB } from '../store'
import { useUi } from '../ui'
import { Menu } from './Menu'
import { Select } from './Select'

/** Barra de la conversación aislada: rama, cambios, fusionar y quitar. */
export function WorktreeBar({ convId }: { convId: string }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const chat = db.chats[convId]
  const wt = chat?.worktree
  const [info, setInfo] = useState<{ changed: number; ahead: number; exists: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const stamp = `${chat?.messages.length ?? 0}:${chat?.running}`

  useEffect(() => {
    if (!wt) return setInfo(null)
    let alive = true
    void window.api.call('chat:worktreeInfo', convId).then((i) => alive && setInfo(i)).catch(() => {})
    return () => {
      alive = false
    }
  }, [convId, wt?.dir, stamp])

  if (!wt) return null
  const act = async (op: 'merge' | 'remove'): Promise<void> => {
    const text =
      op === 'merge'
        ? `Se fusionará la rama «${wt.branch}» en «${wt.base}» del repositorio original. Si hay conflictos no se cambia nada.`
        : `Se eliminará la carpeta de la copia aislada. La rama «${wt.branch}» se conserva, pero lo que no esté confirmado en la copia se pierde.`
    if (!(await ui.confirm(text, { title: op === 'merge' ? 'Fusionar los cambios' : 'Quitar la copia aislada', confirmLabel: op === 'merge' ? 'Fusionar' : 'Quitar', danger: op === 'remove' }))) return
    setBusy(true)
    const msg = await ui.run('chat:worktree', convId, op)
    setBusy(false)
    if (msg) ui.toast(msg)
  }
  return (
    <div className="wt-bar" title={wt.dir}>
      <span>
        ⎇ <b>Copia aislada</b> · rama <code>{wt.branch}</code> desde <code>{wt.base}</code>
      </span>
      <span className="meta">
        {info ? (info.exists ? `${info.changed} sin confirmar · ${info.ahead} confirmaciones` : 'la carpeta ya no existe') : ''}
      </span>
      <span className="grow" />
      <button className="btn sm" disabled={busy || !info?.exists} onClick={() => void act('merge')} title="Trae lo hecho en la copia a la rama original">
        Fusionar en {wt.base}
      </button>
      <button className="btn sm" disabled={busy} onClick={() => void act('remove')} title="Elimina la carpeta de la copia (la rama se conserva)">
        Quitar
      </button>
    </div>
  )
}

/** Aviso cuando la cuenta se acerca al límite, con la opción de pasar al modelo más barato. */
export function LimitBanner({ convId }: { convId: string }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const chat = db.chats[convId]
  const [hidden, setHidden] = useState<string | null>(null)
  const l = db.limits
  const now = Date.now() / 1000
  const wins = [
    { label: 'la sesión de 5 h', w: l?.fiveHour },
    { label: 'la semana', w: l?.sevenDay }
  ].filter((x) => x.w && x.w.resetsAt > now)
  const top = wins.sort((a, b) => (b.w?.utilization ?? 0) - (a.w?.utilization ?? 0))[0]
  const pct = Math.round((top?.w?.utilization ?? 0) * 100)
  const provider = chat?.provider ?? 'claude'
  const cheap =
    provider === 'claude'
      ? 'haiku'
      : (db.settings.copilotModels.split(/\r?\n/).map((m) => m.trim()).find((m) => /mini|haiku|flash|nano/i.test(m)) ?? '')
  const key = `${top?.label}:${top?.w?.resetsAt}:${pct >= 95 ? 95 : 80}`
  if (!top || pct < 80 || !cheap || chat?.model === cheap || hidden === key || chat?.kind === 'review' || db.settings.limitAlerts === false) return null
  return (
    <div className={`limit-banner ${pct >= 95 ? 'critical' : 'warn'}`}>
      <span>
        Llevas <b>{pct} %</b> de {top.label}. Con un modelo más barato rinde más.
      </span>
      <span className="grow" />
      <button className="btn sm primary" disabled={chat?.running} onClick={() => void ui.run('chat:config', convId, { model: cheap })}>
        Usar {cheap}
      </button>
      <button className="btn sm" onClick={() => setHidden(key)}>
        Ahora no
      </button>
    </div>
  )
}

/** Botón «Probar»: ejecuta test, build, lint… del proyecto y muestra el resultado, con opción de pedirle a Claude que lo arregle. */
export function ChecksButton({ taskId, convId }: { taskId: string; convId: string }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const running = !!db.chats[convId]?.running
  const [defs, setDefs] = useState<CheckDef[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [res, setRes] = useState<CheckResult | null>(null)

  useEffect(() => {
    let alive = true
    void window.api.call('check:list', taskId).then((d) => alive && setDefs(d)).catch(() => alive && setDefs([]))
    return () => {
      alive = false
    }
  }, [taskId, db.chats[convId]?.worktree?.dir])

  const run = async (name: string): Promise<void> => {
    setBusy(name)
    try {
      setRes(await window.api.call('check:run', taskId, name, convId))
    } catch (e) {
      ui.toast((e as Error).message, true)
    }
    setBusy(null)
  }

  const fix = (): void => {
    if (!res) return
    const text = `Ejecuté «${res.cmd}» y falló (código ${res.code ?? '—'}). Esta es la salida${res.truncated ? ' (recortada al final)' : ''}:\n\n\`\`\`\n${res.output}\n\`\`\`\n\nRevisa la causa y corrígela. Luego vuelve a ejecutar el comando para comprobar que pasa.`
    setRes(null)
    void ui.run('chat:send', convId, text)
  }

  if (!defs.length) return null
  return (
    <>
      <Menu
        trigger={busy ? `⟳ ${busy}…` : '▶ Probar'}
        title="Ejecuta las pruebas, la compilación o el lint del proyecto"
        items={defs.map((d) => ({ label: d.name, icon: '▶', hint: d.cmd, disabled: !!busy, onSelect: () => void run(d.name) }))}
      />
      {res &&
        createPortal(
        <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && setRes(null)}>
          <div className="dialog check-dialog">
            <h2>
              {res.ok ? '✓' : '✕'} {res.cmd}
            </h2>
            <div className="meta">
              {res.ok ? 'Terminó bien' : `Falló (código ${res.code ?? '—'})`} · {(res.ms / 1000).toFixed(1)} s{res.truncated ? ' · salida recortada' : ''}
            </div>
            <pre className="check-out">{res.output || '(sin salida)'}</pre>
            <div className="foot">
              {!res.ok && (
                <button className="btn primary" disabled={running} onClick={fix} title="Envía esta salida a la conversación y le pide corregirlo">
                  ✦ Pedirle a Claude que lo arregle
                </button>
              )}
              <button className="btn" onClick={() => void navigator.clipboard.writeText(res.output)}>
                Copiar salida
              </button>
              <button className="btn" onClick={() => setRes(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

/** Selector de perfil de agente (modo, modelo, instrucciones y solo lectura guardados con nombre). */
export function ProfileSelect({ convId }: { convId: string }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const chat = db.chats[convId]
  const profiles = profilesOf(db.settings)
  if (!profiles.length || chat?.kind) return null
  return (
    <Select
      className="mini-sel"
      ariaLabel="Perfil"
      title="Perfil: modo, modelo e instrucciones guardados. Se editan en Ajustes → Chat"
      disabled={!!chat?.running}
      value={chat?.profileId ?? ''}
      onChange={(v) => void ui.run('chat:config', convId, { profileId: v })}
      options={[{ value: '', label: 'Perfil: ninguno' }, ...profiles.map((p) => ({ value: p.id, label: `${p.icon} ${p.name}${p.readOnly ? ' (lectura)' : ''}` }))]}
    />
  )
}
