import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import type { FileContent, FileEntry, FileRoot } from '../../../shared/types'
import { findTask, useDB } from '../store'
import { useTaskSlot } from '../taskSlot'
import { useUi } from '../ui'
import { CodeViewer } from './CodeViewer'
import { G, type GlyphName } from './glyphs'

export interface FileRequest {
  taskId: string
  /** Ruta absoluta o relativa a una de las carpetas de la tarea. */
  path: string
  nonce: number
}

const sep = (p: string): string => p.replace(/\\/g, '/')
const fmtSize = (n: number): string => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`)

const CODE = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'css', 'scss', 'html', 'htm', 'vue', 'py', 'sql', 'xml', 'java', 'c', 'h', 'cpp', 'hpp', 'rs', 'cs', 'go', 'sh', 'bash', 'ps1', 'psm1', 'yml', 'yaml', 'toml', 'xaml', 'csproj'])
const CONFIG = new Set(['json', 'lock', 'env', 'ini', 'conf', 'config', 'gitignore', 'editorconfig'])
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg', 'bmp'])
const extOf = (name: string): string => (name.includes('.') ? (name.toLowerCase().split('.').pop() ?? '') : '')
/** Icono del archivo según su tipo: código, configuración, imagen o documento. */
const fileIcon = (name: string): GlyphName => {
  const e = extOf(name)
  return CODE.has(e) ? 'code' : CONFIG.has(e) ? 'settings' : IMAGE.has(e) ? 'image' : 'files'
}
const LANG: Record<string, string> = { ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', json: 'JSON', css: 'CSS', scss: 'SCSS', html: 'HTML', htm: 'HTML', vue: 'Vue', md: 'Markdown', markdown: 'Markdown', py: 'Python', sql: 'SQL', xml: 'XML', svg: 'SVG', java: 'Java', c: 'C', h: 'C', cpp: 'C++', hpp: 'C++', rs: 'Rust', cs: 'C#', go: 'Go', yml: 'YAML', yaml: 'YAML', sh: 'Shell', bash: 'Shell', ps1: 'PowerShell', toml: 'TOML', txt: 'Texto' }
const langOf = (name: string): string => LANG[extOf(name)] ?? (extOf(name) ? extOf(name).toUpperCase() : 'Texto')

interface Open {
  root: string
  rel: string
}

function Node({
  taskId,
  root,
  rel,
  name,
  dir,
  depth,
  openFile,
  current
}: {
  taskId: string
  root: string
  rel: string
  name: string
  dir: boolean
  depth: number
  openFile: (o: Open) => void
  current: Open | null
}): ReactNode {
  const [open, setOpen] = useState(false)
  const [kids, setKids] = useState<FileEntry[] | null>(null)
  const here = rel ? `${rel}/${name}` : name
  const toggle = (): void => {
    if (!dir) return openFile({ root, rel: here })
    if (!open && !kids) void window.api.call('files:list', taskId, root, here).then(setKids, () => setKids([]))
    setOpen(!open)
  }
  const sel = !dir && current?.root === root && current.rel === here
  return (
    <>
      <div className={`ftree-row${sel ? ' on' : ''}${dir ? ' dir' : ''}`} style={{ paddingLeft: 8 + depth * 16 }} onClick={toggle} title={here}>
        <span className={`ftree-chev${open ? ' open' : ''}`}>{dir && <G n="chevron" size={11} stroke={2} />}</span>
        <span className="ftree-ic">
          <G n={dir ? 'folders' : fileIcon(name)} size={15} />
        </span>
        <span className="ftree-n">{name}</span>
      </div>
      {open &&
        kids?.map((k) => <Node key={k.name} taskId={taskId} root={root} rel={here} name={k.name} dir={k.dir} depth={depth + 1} openFile={openFile} current={current} />)}
    </>
  )
}

/** Pestaña «Archivos» de una tarea: explorador de sus carpetas y visor de código de solo lectura. */
export function FilesView({ taskId, request }: { taskId: string; request: FileRequest | null }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const task = findTask(db, taskId)
  const [roots, setRoots] = useState<FileRoot[]>([])
  const [rootTops, setRootTops] = useState<Record<string, FileEntry[]>>({})
  const [cur, setCur] = useState<Open | null>(null)
  const [content, setContent] = useState<FileContent | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Open[]>([])
  const taskSlot = useTaskSlot()

  useEffect(() => {
    let live = true
    void window.api.call('files:roots', taskId).then(async (r) => {
      if (!live) return
      setRoots(r)
      const tops: Record<string, FileEntry[]> = {}
      for (const x of r) tops[x.path] = await window.api.call('files:list', taskId, x.path, '').catch(() => [])
      if (live) setRootTops(tops)
    })
    return () => {
      live = false
    }
  }, [taskId])

  const open = useCallback(
    (o: Open): void => {
      setCur(o)
      setErr('')
      setContent(null)
      void window.api.call('files:read', taskId, o.root, o.rel).then(setContent, (e: Error) => setErr(e.message))
    },
    [taskId]
  )

  // «Ver archivo» desde el chat: la ruta puede ser absoluta (se busca su carpeta) o relativa (se prueba en cada carpeta)
  useEffect(() => {
    if (!request || request.taskId !== taskId || !roots.length) return
    const p = sep(request.path)
    const abs = roots.find((r) => p.toLowerCase().startsWith(sep(r.path).toLowerCase() + '/'))
    if (abs) return open({ root: abs.path, rel: p.slice(sep(abs.path).length + 1) })
    void (async () => {
      for (const r of roots) {
        const ok = await window.api.call('files:read', taskId, r.path, p).then(
          () => true,
          () => false
        )
        if (ok) return open({ root: r.path, rel: p })
      }
      setErr(`No encuentro «${request.path}» en las carpetas de la tarea.`)
    })()
  }, [request, roots, taskId, open])

  // búsqueda por nombre en todas las carpetas de la tarea
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setHits([])
      return
    }
    let live = true
    const id = setTimeout(() => {
      void Promise.all(
        roots.map((r) =>
          window.api.call('files:find', taskId, r.path, term).then(
            (l) => l.map((rel) => ({ root: r.path, rel: sep(rel) })),
            () => []
          )
        )
      ).then((all) => live && setHits(all.flat().slice(0, 80)))
    }, 250)
    return () => {
      live = false
      clearTimeout(id)
    }
  }, [q, roots, taskId])

  if (!task) return null
  const codeBtn = (
    <button className="btn sm" title="Abrir la carpeta en VS Code (aquí solo se lee)" onClick={() => void ui.run('vscode:open', cur?.root ?? roots[0]?.path ?? task.folder)}>
      <G n="popout" size={13} /> Abrir en VS Code
    </button>
  )
  return (
    <div className="files">
      {taskSlot ? createPortal(codeBtn, taskSlot) : null}
      <aside className="files-side">
        <label className="files-q">
          <G n="search" size={13} />
          <input value={q} placeholder="Buscar archivo por nombre…" aria-label="Buscar archivo" onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="files-tree">
          {q.trim().length >= 2 ? (
            hits.length ? (
              hits.map((h) => (
                <div key={h.root + h.rel} className={`ftree-row${cur?.root === h.root && cur.rel === h.rel ? ' on' : ''}`} onClick={() => open(h)} title={h.rel}>
                  <span className="ftree-chev" />
                  <span className="ftree-ic">
                    <G n={fileIcon(h.rel)} size={15} />
                  </span>
                  <span className="ftree-n">{h.rel}</span>
                </div>
              ))
            ) : (
              <div className="meta" style={{ padding: 10 }}>
                Sin resultados
              </div>
            )
          ) : roots.length ? (
            roots.map((r) => (
              <div key={r.path}>
                <div className="ftree-row dir root" title={r.path}>
                  <span className="ftree-chev open">
                    <G n="chevron" size={11} stroke={2} />
                  </span>
                  <span className="ftree-ic">
                    <G n="folders" size={15} />
                  </span>
                  <span className="ftree-n">{r.name}</span>
                </div>
                {rootTops[r.path]?.map((e) => (
                  <Node key={e.name} taskId={taskId} root={r.path} rel="" name={e.name} dir={e.dir} depth={1} openFile={open} current={cur} />
                ))}
              </div>
            ))
          ) : (
            <div className="meta" style={{ padding: 10 }}>
              Esta tarea no tiene carpeta ni grupo con carpetas. Asígnale una en «Editar tarea».
            </div>
          )}
        </div>
      </aside>
      <section className="files-main">
        {cur ? (
          <>
            <div className="files-bar">
              <span className="files-ic" aria-hidden>
                <G n="code" size={15} />
              </span>
              <b className="files-path" title={`${cur.root}/${cur.rel}`}>
                {cur.rel}
              </b>
              <span className="chip">{langOf(cur.rel)}</span>
              <span className="grow" />
              {content && <span className="meta">{fmtSize(content.size)}</span>}
              <button className="btn sm ghost" title="Copiar la ruta completa del archivo" onClick={() => void navigator.clipboard.writeText(`${cur.root}\\${cur.rel.replace(/\//g, '\\')}`).then(() => ui.toast('Ruta copiada'))}>
                Copiar ruta
              </button>
              {!taskSlot && codeBtn}
              <span className="chip">solo lectura</span>
            </div>
            {err ? (
              <div className="empty" style={{ margin: 16 }}>
                ⚠ {err}
              </div>
            ) : !content ? (
              <div className="meta" style={{ padding: 16 }}>
                Leyendo…
              </div>
            ) : content.binary ? (
              <div className="empty" style={{ margin: 16 }}>
                Archivo binario ({fmtSize(content.size)}): no se puede mostrar.
              </div>
            ) : (
              <>
                {content.truncated && <div className="files-warn">Archivo grande: se muestra solo el principio ({fmtSize(content.size)} en total).</div>}
                <CodeViewer text={content.text} file={cur.rel} />
              </>
            )}
          </>
        ) : (
          <div className="empty" style={{ margin: 'auto', maxWidth: 380 }}>
            {err || 'Elige un archivo del árbol para verlo. Solo lectura: para editar, usa «Abrir en VS Code».'}
          </div>
        )}
      </section>
    </div>
  )
}
