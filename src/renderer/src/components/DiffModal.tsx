import type { ReactNode } from 'react'
import type { Hunk } from '../../../shared/types'
import { useDB } from '../store'
import { hhmm } from '../utils'
import { useUi } from '../ui'

function Line({ cls, sign, text }: { cls: string; sign: string; text: string }): ReactNode {
  return (
    <div className={`dl ${cls}`}>
      <i>{sign}</i>
      <span>{text || ' '}</span>
    </div>
  )
}

// diff por líneas sencillo: recorta el prefijo y sufijo comunes y muestra lo quitado / lo agregado
function HunkView({ hunk: h }: { hunk: Hunk }): ReactNode {
  if (h.old == null) return <>{h.new.split('\n').map((l, i) => <Line key={i} cls="add" sign="+" text={l} />)}</>
  const a = h.old.split('\n')
  const b = h.new.split('\n')
  let s = 0
  while (s < a.length && s < b.length && a[s] === b[s]) s++
  let ea = a.length
  let eb = b.length
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) {
    ea--
    eb--
  }
  const rows: Array<[string, string, string]> = [
    ...a.slice(Math.max(0, s - 2), s).map((l): [string, string, string] => ['ctx', ' ', l]),
    ...a.slice(s, ea).map((l): [string, string, string] => ['del', '−', l]),
    ...b.slice(s, eb).map((l): [string, string, string] => ['add', '+', l]),
    ...a.slice(ea, ea + 2).map((l): [string, string, string] => ['ctx', ' ', l])
  ]
  return (
    <>
      {rows.map(([cls, sign, text], i) => (
        <Line key={i} cls={cls} sign={sign} text={text} />
      ))}
    </>
  )
}

export function DiffModal({ file, convId }: { file: string; convId: string }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const edits = (db.chats[convId]?.activity ?? []).filter((a) => a.kind === 'edit' && a.target === file && a.status !== 'error')

  return (
    <div className="dialog wide">
      <h2>
        <code>{file}</code>
      </h2>
      <div className="sub">
        {edits.length} {edits.length === 1 ? 'cambio' : 'cambios'} hechos por Claude en esta conversación
      </div>
      {edits.length ? (
        edits.map((a, i) => (
          <div className="hunk" key={a.id}>
            <div className="hunk-h">
              <b>{a.label}</b> · {hhmm(a.ts)} <span className="chip">cambio {i + 1} de {edits.length}</span>
            </div>
            <div className="diff">
              {a.hunks?.length ? (
                a.hunks.map((h, j) => (
                  <div key={j}>
                    {j > 0 && <Line cls="sep" sign="" text="⋯" />}
                    <HunkView hunk={h} />
                  </div>
                ))
              ) : (
                <div className="meta" style={{ padding: 8 }}>
                  Sin detalle guardado (cambio anterior a esta función).
                </div>
              )}
            </div>
          </div>
        ))
      ) : (
        <div className="empty">Sin cambios registrados</div>
      )}
      <div className="foot">
        <span className="sp" />
        <button className="btn" onClick={ui.closeModal}>
          Cerrar
        </button>
      </div>
    </div>
  )
}
