import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

type Row = { t: 'add' | 'del' | 'ctx'; text: string; o?: number; n?: number }
type Hunk = { head: string; rows: Row[] }
type FileDiff = { name: string; hunks: Hunk[]; add: number; del: number; generated: boolean; binary: boolean; meta: string[] }

const MAX_ROWS = 4000
const GENERATED = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|poetry\.lock|composer\.lock|Gemfile\.lock|go\.sum)$|\.min\.(js|css)$|(^|\/)(dist|build|out|node_modules)\/|\.map$|\.snap$/i

/** Interpreta un diff unificado de Git (de uno o varios archivos) en archivos, bloques y líneas con su numeración. */
export function parseDiff(text: string): FileDiff[] {
  const files: FileDiff[] = []
  let file: FileDiff | null = null
  let hunk: Hunk | null = null
  let o = 0
  let n = 0
  const start = (name: string): FileDiff => {
    const f: FileDiff = { name, hunks: [], add: 0, del: 0, generated: GENERATED.test(name), binary: false, meta: [] }
    files.push(f)
    return f
  }
  for (const l of text.split(/\r?\n/)) {
    if (l.startsWith('diff --git ')) {
      const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(l)
      file = start(m ? m[2] : l.slice(11))
      hunk = null
      continue
    }
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(l)
    if (h) {
      file ??= start('(cambios)')
      o = Number(h[1])
      n = Number(h[2])
      hunk = { head: l, rows: [] }
      file.hunks.push(hunk)
      continue
    }
    if (!hunk) {
      // cabeceras (index, ---, +++, modos…) y texto previo al primer bloque
      if (/^(\+\+\+|---) /.test(l)) {
        if (!file && l.startsWith('+++ ')) file = start(l.slice(4).replace(/^b\//, ''))
        continue
      }
      if (l.startsWith('Binary files') || l.startsWith('GIT binary patch')) {
        file ??= start('(binario)')
        file.binary = true
      } else if (l.trim()) {
        if (!file) file = start('(cambios)')
        file.meta.push(l)
      }
      continue
    }
    if (l.startsWith('\\')) continue // «No newline at end of file»
    if (l.startsWith('+')) {
      hunk.rows.push({ t: 'add', text: l.slice(1), n: n++ })
      file!.add++
    } else if (l.startsWith('-')) {
      hunk.rows.push({ t: 'del', text: l.slice(1), o: o++ })
      file!.del++
    } else if (l.startsWith(' ')) hunk.rows.push({ t: 'ctx', text: l.slice(1), o: o++, n: n++ })
  }
  return files
}

/** Empareja bloques de líneas quitadas con las agregadas para la vista lado a lado. */
function pairRows(rows: Row[]): Array<[Row | null, Row | null]> {
  const out: Array<[Row | null, Row | null]> = []
  for (let i = 0; i < rows.length; ) {
    if (rows[i].t === 'ctx') {
      out.push([rows[i], rows[i]])
      i++
      continue
    }
    const dels: Row[] = []
    const adds: Row[] = []
    while (i < rows.length && rows[i].t === 'del') dels.push(rows[i++])
    while (i < rows.length && rows[i].t === 'add') adds.push(rows[i++])
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) out.push([dels[k] ?? null, adds[k] ?? null])
  }
  return out
}

const SPLIT_KEY = 'shutoki.diffSplit'

/**
 * Visor de diff: unificado o lado a lado, con numeración de líneas, navegación entre cambios (botones o N / P),
 * archivos generados (lockfiles, dist…) colapsados y cada archivo plegable.
 */
export function DiffView({ text }: { text: string }): ReactNode {
  const [split, setSplit] = useState(() => {
    try {
      return localStorage.getItem(SPLIT_KEY) === '1'
    } catch {
      return false
    }
  })
  const files = useMemo(() => parseDiff(text), [text])
  const [folded, setFolded] = useState<Record<string, boolean>>({})
  const root = useRef<HTMLDivElement>(null)
  const cur = useRef(-1)

  // al cambiar el diff vuelve el estado de plegado por defecto y la navegación
  useEffect(() => {
    setFolded({})
    cur.current = -1
  }, [text])

  const isFolded = (f: FileDiff): boolean => folded[f.name] ?? f.generated
  const totalAdd = files.reduce((a, f) => a + f.add, 0)
  const totalDel = files.reduce((a, f) => a + f.del, 0)
  const toggleSplit = (v: boolean): void => {
    setSplit(v)
    try {
      localStorage.setItem(SPLIT_KEY, v ? '1' : '0')
    } catch {
      /* sin storage */
    }
  }

  const jump = (dir: 1 | -1): void => {
    const marks = root.current?.querySelectorAll<HTMLElement>('[data-chg]')
    if (!marks?.length) return
    cur.current = (cur.current + dir + marks.length) % marks.length
    marks.forEach((m) => m.classList.remove('chg-cur'))
    const el = marks[cur.current]
    el.classList.add('chg-cur')
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'n' || e.key === 'j') {
      e.preventDefault()
      jump(1)
    } else if (e.key === 'p' || e.key === 'k') {
      e.preventDefault()
      jump(-1)
    }
  }

  if (!files.length) return <div className="meta">Sin cambios que mostrar.</div>

  let budget = MAX_ROWS
  let cut = 0
  return (
    <div className="dv" ref={root} tabIndex={0} onKeyDown={onKey} aria-label="Cambios (N: siguiente cambio, P: anterior)">
      <div className="dv-bar">
        <div className="seg">
          <button className={!split ? 'on' : ''} onClick={() => toggleSplit(false)}>
            Unificado
          </button>
          <button className={split ? 'on' : ''} onClick={() => toggleSplit(true)}>
            Lado a lado
          </button>
        </div>
        <button className="btn sm" title="Cambio anterior (P)" onClick={() => jump(-1)}>
          ↑
        </button>
        <button className="btn sm" title="Siguiente cambio (N)" onClick={() => jump(1)}>
          ↓
        </button>
        <span className="meta">
          {files.length} {files.length === 1 ? 'archivo' : 'archivos'} · <b className="dv-add">+{totalAdd}</b> <b className="dv-del">−{totalDel}</b>
        </span>
        {files.length > 1 && (
          <button className="btn sm" onClick={() => setFolded(Object.fromEntries(files.map((f) => [f.name, !files.every((x) => isFolded(x))])))}>
            {files.every((f) => isFolded(f)) ? 'Expandir todo' : 'Plegar todo'}
          </button>
        )}
      </div>
      {files.map((f) => {
        const open = !isFolded(f)
        return (
          <section key={f.name} className="dv-file">
            <button className="dv-fh" aria-expanded={open} onClick={() => setFolded((s) => ({ ...s, [f.name]: open }))}>
              <span className="dv-car">{open ? '▾' : '▸'}</span>
              <code>{f.name}</code>
              {f.generated && <span className="chip">generado</span>}
              {f.binary && <span className="chip">binario</span>}
              <span className="dv-add">+{f.add}</span> <span className="dv-del">−{f.del}</span>
            </button>
            {open && f.binary && <div className="meta" style={{ padding: 8 }}>Archivo binario: no hay vista de cambios.</div>}
            {open &&
              f.hunks.map((h, hi) => {
                const take = Math.max(0, Math.min(h.rows.length, budget))
                budget -= take
                cut += h.rows.length - take
                const rows = h.rows.slice(0, take)
                return (
                  <div key={hi} className="dv-hunk">
                    <div className="dv-hh">{h.head}</div>
                    {split ? <Split rows={rows} /> : <Unified rows={rows} />}
                  </div>
                )
              })}
          </section>
        )
      })}
      {cut > 0 && <div className="meta" style={{ padding: 8 }}>… {cut} líneas más (abre el archivo en VS Code para verlo completo).</div>}
    </div>
  )
}

const sign = (t: Row['t']): string => (t === 'add' ? '+' : t === 'del' ? '−' : ' ')

function Unified({ rows }: { rows: Row[] }): ReactNode {
  return (
    <div className="dv-u">
      {rows.map((r, i) => (
        <div key={i} className={`dv-l ${r.t}`} data-chg={r.t !== 'ctx' && (i === 0 || rows[i - 1].t === 'ctx') ? '' : undefined}>
          <em>{r.o ?? ''}</em>
          <em>{r.n ?? ''}</em>
          <i>{sign(r.t)}</i>
          <span>{r.text || ' '}</span>
        </div>
      ))}
    </div>
  )
}

function Split({ rows }: { rows: Row[] }): ReactNode {
  const pairs = pairRows(rows)
  return (
    <div className="dv-s">
      {pairs.map(([a, b], i) => {
        const changed = a?.t !== 'ctx'
        const prevChanged = i > 0 && pairs[i - 1][0]?.t !== 'ctx'
        return (
          <div key={i} className="dv-sr" data-chg={changed && !prevChanged ? '' : undefined}>
            <div className={`dv-c ${a ? (a.t === 'ctx' ? 'ctx' : 'del') : 'gap'}`}>
              <em>{a?.o ?? ''}</em>
              <span>{a ? a.text || ' ' : ' '}</span>
            </div>
            <div className={`dv-c ${b ? (b.t === 'ctx' ? 'ctx' : 'add') : 'gap'}`}>
              <em>{b?.n ?? ''}</em>
              <span>{b ? b.text || ' ' : ' '}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
