import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { GitBranches, GitCommit, GitFile, GitRepo, GitStatus, IssueRef, RemoteInfo } from '../../../shared/types'
import { baseName } from '../utils'
import { findTask, useDB } from '../store'
import { useUi } from '../ui'
import { EmptyState } from './EmptyState'
import { Select, type SelectOption } from './Select'

type Sel = { path: string; kind: 'staged' | 'work' | 'untracked' } | { hash: string }

const LETTER: Record<string, [string, string]> = {
  M: ['M', 'modificado'],
  A: ['A', 'añadido'],
  D: ['D', 'eliminado'],
  R: ['R', 'renombrado'],
  C: ['C', 'copiado'],
  T: ['T', 'cambio de tipo'],
  U: ['!', 'conflicto']
}
const letterOf = (f: GitFile, side: 'index' | 'work'): [string, string] => (f.untracked ? ['U', 'sin seguimiento'] : f.conflicted ? LETTER.U : (LETTER[f[side]] ?? [f[side], '']))

function DiffText({ text }: { text: string }): ReactNode {
  const lines = text.split(/\r?\n/)
  const shown = lines.slice(0, 3000)
  return (
    <div className="diff gdiff">
      {shown.map((l, i) => {
        const cls = l.startsWith('+++') || l.startsWith('---') || l.startsWith('diff ') || l.startsWith('index ') ? 'sep' : l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : l.startsWith('@@') ? 'sep' : 'ctx'
        const sign = cls === 'add' ? '+' : cls === 'del' ? '−' : ' '
        return (
          <div key={i} className={`dl ${cls}`}>
            <i>{sign}</i>
            <span>{cls === 'add' || cls === 'del' ? l.slice(1) || ' ' : l || ' '}</span>
          </div>
        )
      })}
      {lines.length > shown.length && <div className="meta" style={{ padding: 8 }}>… {lines.length - shown.length} líneas más (abre el archivo en VS Code para verlo completo).</div>}
    </div>
  )
}

function Row({ f, side, selected, onSelect, actions }: { f: GitFile; side: 'index' | 'work'; selected: boolean; onSelect: () => void; actions: ReactNode }): ReactNode {
  const [l, label] = letterOf(f, side)
  return (
    <div className={`gfile ${selected ? 'on' : ''}`} onClick={onSelect} title={`${f.path} · ${label}`}>
      <span className={`gl g-${l}`}>{l}</span>
      <span className="gname">
        <b>{baseName(f.path)}</b>
        <small>{f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''}</small>
      </span>
      <span className="gact" onClick={(e) => e.stopPropagation()}>
        {actions}
      </span>
    </div>
  )
}

/** Control de código de la tarea, al estilo de VS Code: cambios, preparación, commit, ramas, sincronización e historial. */
export function GitView({ taskId }: { taskId: string }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const task = findTask(db, taskId)
  const [repos, setRepos] = useState<GitRepo[]>([])
  const [dir, setDir] = useState<string>('')
  const [st, setSt] = useState<GitStatus | null>(null)
  const [br, setBr] = useState<GitBranches | null>(null)
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [error, setError] = useState('')
  const [sel, setSel] = useState<Sel | null>(null)
  const [diff, setDiff] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [newBranch, setNewBranch] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(true)
  const [remote, setRemote] = useState<RemoteInfo | null>(null)
  const [panel, setPanel] = useState<null | 'pick' | 'create'>(null)
  const [issues, setIssues] = useState<IssueRef[] | null>(null)
  const [issueNum, setIssueNum] = useState('')
  const [draftIssue, setDraftIssue] = useState({ title: '', body: '' })
  const [prDraft, setPrDraft] = useState<{ title: string; body: string } | null>(null)
  const busyRef = useRef('')
  busyRef.current = busy

  // tipo de remoto (GitHub, GitLab…): decide qué acciones de issue y PR se ofrecen
  useEffect(() => {
    let alive = true
    setRemote(null)
    if (dir) void window.api.call('git:remote', dir).then((r) => alive && setRemote(r)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [dir, st?.upstream])

  // repositorios candidatos: la carpeta de la tarea y las de sus grupos
  useEffect(() => {
    let alive = true
    void window.api.call('git:repos', taskId).then((r) => {
      if (!alive) return
      setRepos(r)
      setDir((cur) => (cur && r.some((x) => x.dir === cur) ? cur : (r.find((x) => x.isRepo) ?? r[0])?.dir ?? ''))
    })
    return () => {
      alive = false
    }
  }, [taskId, db.groups.length])

  const current = repos.find((r) => r.dir === dir)

  const refresh = useCallback(async () => {
    if (!dir || !current?.isRepo) return
    try {
      const [s, b, l] = await Promise.all([window.api.call('git:status', dir), window.api.call('git:branches', dir), window.api.call('git:log', dir, 40)])
      setSt(s)
      setBr(b)
      setCommits(l)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [dir, current?.isRepo])

  useEffect(() => {
    setSt(null)
    setSel(null)
    setDiff('')
    void refresh()
    const id = setInterval(() => {
      if (!busyRef.current && document.visibilityState === 'visible') void refresh()
    }, 5000)
    const onFocus = (): void => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  // diff del archivo (o patch del commit) seleccionado; se vuelve a pedir si cambió el estado
  useEffect(() => {
    if (!sel || !dir) return setDiff('')
    let alive = true
    const p = 'hash' in sel ? window.api.call('git:show', dir, sel.hash) : window.api.call('git:diff', dir, sel.path, sel.kind)
    void p.then((t) => alive && setDiff(t)).catch((e: Error) => alive && setDiff(`No se pudo mostrar: ${e.message}`))
    return () => {
      alive = false
    }
  }, [sel, dir, st?.files.length])

  const act = async (label: string, fn: () => Promise<unknown>, okMsg?: string): Promise<boolean> => {
    setBusy(label)
    try {
      const r = await fn()
      if (okMsg) ui.toast(okMsg)
      else if (typeof r === 'string' && r) ui.toast(r.split('\n')[0])
      await refresh()
      return true
    } catch (e) {
      const m = (e as Error).message
      const login = /authenticat|auth login|setup-token|OAUTH_TOKEN|not logged in|invalid api key/i.test(m)
      ui.toast(login ? 'La sesión de Claude venció. Inicia sesión de nuevo y vuelve a intentarlo.' : m, true, login ? { label: 'Iniciar sesión', run: () => void ui.run('claude:login') } : undefined)
      return false
    } finally {
      setBusy('')
    }
  }

  if (!task) return null
  if (!repos.length) return <EmptyState kind="folders" title="La tarea no tiene carpeta" text="Asigna una carpeta de proyecto a la tarea para ver su repositorio de Git." />
  if (current && !current.isRepo) {
    return (
      <>
        <h1>Git</h1>
        <EmptyState
          kind="folders"
          title={`«${current.name}» no es un repositorio de Git`}
          text="Puedes iniciar uno aquí para empezar a versionar el proyecto."
          action={
            <button className="btn primary" disabled={!!busy} onClick={() => void act('init', () => window.api.call('git:init', current.dir).then(() => window.api.call('git:repos', taskId).then(setRepos)), 'Repositorio iniciado')}>
              Inicializar repositorio
            </button>
          }
        />
      </>
    )
  }

  const files = st?.files ?? []
  const conflicts = files.filter((f) => f.conflicted)
  const staged = files.filter((f) => f.staged)
  const changes = files.filter((f) => f.unstaged || f.untracked)
  const isSel = (path: string, kind: string): boolean => !!sel && 'path' in sel && sel.path === path && sel.kind === kind

  const commit = (): void => {
    if (!dir || !staged.length || !msg.trim()) return
    void act('commit', () => window.api.call('git:commit', dir, msg)).then((ok) => {
      if (ok) {
        setMsg('')
        setSel(null)
      }
    })
  }

  const copy = (text: string, what: string): void => {
    void navigator.clipboard.writeText(text).then(() => ui.toast(`${what} copiado`))
  }

  // publica la rama y entrega el enlace del PR (el de creación o el del PR que ya existe); el PR siempre lo revisa otra persona
  const pushBranch = async (): Promise<void> => {
    setBusy('push')
    const r = await ui.run('git:push', dir, taskId)
    setBusy('')
    if (!r) return
    if (r.pr) {
      const url = r.pr.url
      ui.toast(r.pr.exists ? `Enviado · PR #${r.pr.number} ya abierto` : 'Rama publicada · enlace del PR listo', false, { label: r.pr.exists ? 'Abrir PR' : 'Crear PR', run: () => void ui.run('url:open', url) })
    } else {
      ui.toast(r.note ? `${r.message.split('\n')[0]} · ${r.note}` : r.message.split('\n')[0])
    }
    await refresh()
  }

  const reviewerMessage = (): string => {
    const pr = task.pr
    if (!pr) return ''
    return [`Hola, ¿puedes revisar este PR?`, '', pr.title || task.title, pr.url, task.issue ? `Issue: ${task.issue.url}` : '', `${pr.branch} → ${pr.base}`].filter((l, i) => l || i === 1).join('\n')
  }

  const startReview = async (): Promise<void> => {
    setBusy('revisión')
    const id = await ui.run('review:start', taskId, dir)
    setBusy('')
    if (id) ui.openChat(taskId, id)
  }

  const openPick = async (): Promise<void> => {
    setPanel('pick')
    setIssues(null)
    setIssues((await ui.run('issue:list', dir)) ?? [])
  }

  const fromIssue = async (n: number): Promise<void> => {
    if (!Number.isInteger(n) || n <= 0) return ui.toast('Escribe el número de la issue', true)
    const ok = await act('issue', () => window.api.call('issue:branch', taskId, dir, n), `Rama de la issue #${n} lista`)
    if (ok) {
      setPanel(null)
      setIssueNum('')
    }
  }

  const createIssue = async (): Promise<void> => {
    const ok = await act(
      'issue',
      async () => {
        const i = await window.api.call('issue:create', dir, draftIssue.title, draftIssue.body)
        await window.api.call('issue:branch', taskId, dir, i.number)
      },
      'Issue creada y rama lista'
    )
    if (ok) setPanel(null)
  }

  const discard = async (f: GitFile): Promise<void> => {
    if (!(await ui.confirm(`Se descartarán los cambios de «${f.path}». No se puede deshacer.`, { title: "Descartar cambios", confirmLabel: "Descartar", danger: true }))) return
    void act('discard', () => window.api.call('git:discard', dir, f.untracked ? [] : [f.path], f.untracked ? [f.path] : []))
  }

  const branchOptions: SelectOption[] = br
    ? [
        ...(br.local.includes(br.current) ? [] : [{ value: br.current, label: br.current }]),
        ...br.local.map((b) => ({ value: b, label: b })),
        ...br.remote
          .filter((r) => !br.local.includes(r.replace(/^[^/]+\//, '')))
          .map((r) => ({ value: r, label: r, group: 'Remotas (crea la rama local)' }))
      ]
    : []

  return (
    <div className="gitv">
      <div className="gbar">
        {repos.length > 1 && (
          <Select
            value={dir}
            ariaLabel="Repositorio"
            onChange={setDir}
            options={repos.map((r) => ({ value: r.dir, label: r.name + (r.isRepo ? '' : ' (sin Git)'), disabled: !r.isRepo }))}
          />
        )}
        <span className="gbranch" title={st?.root}>
          ⎇
          <Select
            value={br?.current ?? ''}
            ariaLabel="Rama"
            disabled={!!busy || !br}
            searchable
            menuMinWidth={320}
            onChange={(b) => void act('checkout', () => window.api.call('git:checkout', dir, b, false), `Ahora en ${b}`)}
            options={branchOptions}
          />
        </span>
        {newBranch === null ? (
          <button className="btn sm" onClick={() => setNewBranch('')}>
            ＋ Rama
          </button>
        ) : (
          <span className="gnew">
            <input
              autoFocus
              value={newBranch}
              placeholder="nombre-de-la-rama"
              aria-label="Nombre de la rama nueva"
              onChange={(e) => setNewBranch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setNewBranch(null)
                if (e.key === 'Enter' && newBranch.trim()) void act('branch', () => window.api.call('git:checkout', dir, newBranch.trim(), true), `Rama «${newBranch.trim()}» creada`).then((ok) => ok && setNewBranch(null))
              }}
            />
            <button className="btn sm" onClick={() => setNewBranch(null)}>
              ✕
            </button>
          </span>
        )}
        <span className="grow" />
        {st && !st.upstream && <span className="meta">sin rama remota</span>}
        <button className="btn sm" disabled={!!busy} title="Traer los cambios del remoto sin aplicarlos" onClick={() => void act('fetch', () => window.api.call('git:sync', dir, 'fetch'), 'Fetch hecho')}>
          ⟳ Fetch
        </button>
        <button className="btn sm" disabled={!!busy || !st?.upstream} title="Traer y aplicar los cambios del remoto" onClick={() => void act('pull', () => window.api.call('git:sync', dir, 'pull'))}>
          ↓ Pull{st?.behind ? ` ${st.behind}` : ''}
        </button>
        <button
          className={`btn sm ${st?.ahead || (st && !st.upstream) ? 'primary' : ''}`}
          disabled={!!busy}
          title={st?.upstream ? 'Enviar tus commits al remoto' : 'Publicar la rama en el remoto'}
          onClick={() => void pushBranch()}
        >
          ↑ {st?.upstream ? 'Push' : 'Publicar'}
          {st?.ahead ? ` ${st.ahead}` : ''}
        </button>
        <button className="btn sm accent" disabled={!!busy} title="Revisión de código con IA: hallazgos, simulación de escenarios y veredicto (solo lectura)" onClick={() => void startReview()}>
          ✦ Revisar código
        </button>
        {busy && <span className="meta">{busy}…</span>}
      </div>
      {error && <div className="gerr">{error}</div>}

      <div className="gwork">
        <div className="gwork-row">
          {task.issue ? (
            <>
              <button className="chip issue" title={`${task.issue.title}\nClic para abrir la issue`} onClick={() => void ui.run('url:open', task.issue!.url)}>
                #{task.issue.number} · {task.issue.title}
              </button>
              <button className="icon" title="Desvincular la issue de la tarea" aria-label="Desvincular la issue" onClick={() => void ui.run('issue:link', taskId, null)}>
                ✕
              </button>
            </>
          ) : (
            <span className="meta">Sin issue vinculada{task.branch ? ` · rama de la tarea: ${task.branch}` : ''}</span>
          )}
          <span className="grow" />
          {remote?.kind === 'github' && (
            <>
              <button className="btn sm" disabled={!!busy} onClick={() => (panel === 'pick' ? setPanel(null) : void openPick())} title="Elige una issue abierta: se crea su rama desde la base actualizada y queda vinculada a la tarea">
                ⎇ Rama desde una issue…
              </button>
              <button
                className="btn sm"
                disabled={!!busy}
                title="Crea la issue en GitHub con el título y la descripción de la tarea, y su rama"
                onClick={() => {
                  setDraftIssue({ title: task.title, body: task.description })
                  setPanel(panel === 'create' ? null : 'create')
                }}
              >
                ＋ Issue desde la tarea
              </button>
            </>
          )}
          {remote && remote.kind !== 'github' && <span className="meta">{remote.kind === 'gitlab' ? 'GitLab' : remote.kind === 'azure' ? 'Azure DevOps' : remote.host}: enlace del PR sí, issues no</span>}
        </div>

        {panel === 'pick' && (
          <div className="gpanel">
            <div className="gpanel-h">
              <b>Issues abiertas</b>
              <span className="grow" />
              <input className="gnum" inputMode="numeric" placeholder="N.º" aria-label="Número de issue" value={issueNum} onChange={(e) => setIssueNum(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && void fromIssue(Number(issueNum))} />
              <button className="btn sm" disabled={!issueNum || !!busy} onClick={() => void fromIssue(Number(issueNum))}>
                Usar este número
              </button>
            </div>
            {issues === null && <div className="meta">Cargando issues…</div>}
            {issues?.length === 0 && <div className="meta">No hay issues abiertas (o no se pudieron leer).</div>}
            <div className="gissues">
              {issues?.map((i) => (
                <button key={i.number} className="gissue" disabled={!!busy} onClick={() => void fromIssue(i.number)} title="Crear la rama de esta issue y vincularla a la tarea">
                  <b>#{i.number}</b>
                  <span>{i.title}</span>
                  {i.labels?.map((l) => (
                    <i key={l} className="chip">
                      {l}
                    </i>
                  ))}
                </button>
              ))}
            </div>
          </div>
        )}

        {panel === 'create' && (
          <div className="gpanel">
            <div className="gpanel-h">
              <b>Nueva issue en {remote?.owner}/{remote?.repo}</b>
            </div>
            <input value={draftIssue.title} placeholder="Título" aria-label="Título de la issue" onChange={(e) => setDraftIssue((d) => ({ ...d, title: e.target.value }))} />
            <textarea rows={4} value={draftIssue.body} placeholder="Descripción (Markdown)" aria-label="Descripción de la issue" onChange={(e) => setDraftIssue((d) => ({ ...d, body: e.target.value }))} />
            <div className="foot" style={{ marginTop: 6 }}>
              <button className="btn sm" onClick={() => setPanel(null)}>
                Cancelar
              </button>
              <button className="btn sm primary" disabled={!draftIssue.title.trim() || !!busy} onClick={() => void createIssue()}>
                Crear issue y su rama
              </button>
            </div>
          </div>
        )}

        {st && task.pr && task.pr.branch === st.branch ? (
          <div className="gpr">
            <div className="gpr-h">
              <b>{task.pr.exists ? `PR #${task.pr.number} abierto` : 'Rama publicada: falta abrir el PR'}</b>
              <span className="meta">
                {task.pr.branch} → {task.pr.base} · lo revisa otra persona
              </span>
            </div>
            <input readOnly className="gpr-url" value={task.pr.url} aria-label="Enlace del PR" onFocus={(e) => e.currentTarget.select()} />
            <div className="gpr-b">
              <button className="btn sm primary" onClick={() => void ui.run('url:open', task.pr!.url)}>
                {task.pr.exists ? 'Abrir PR' : 'Crear PR en el navegador'}
              </button>
              <button className="btn sm" onClick={() => copy(task.pr!.url, 'Enlace')}>
                Copiar enlace
              </button>
              <button className="btn sm" title="Mensaje listo para pegar en el chat de quien va a revisar" onClick={() => copy(reviewerMessage(), 'Mensaje para el revisor')}>
                Copiar mensaje para quien revisa
              </button>
              <button
                className="btn sm"
                disabled={!!busy}
                title="Redacta título y descripción del PR a partir de los commits y el diff"
                onClick={() => void act('descripción', () => window.api.call('git:prText', dir, taskId).then(setPrDraft), 'Descripción lista: cópiala al PR')}
              >
                {busy === 'descripción' ? '✦ Redactando…' : '✦ Descripción del PR'}
              </button>
              <button className="btn sm" disabled={!!busy} title="Vuelve a comprobar si el PR ya existe" onClick={() => void pushBranch()}>
                ⟳ Actualizar
              </button>
            </div>
            {prDraft && (
              <div className="gpr-draft">
                <input readOnly value={prDraft.title} aria-label="Título propuesto" />
                <textarea readOnly rows={8} value={prDraft.body} aria-label="Descripción propuesta" />
                <div className="gpr-b">
                  <button className="btn sm" onClick={() => copy(prDraft.title, 'Título')}>
                    Copiar título
                  </button>
                  <button className="btn sm" onClick={() => copy(prDraft.body, 'Descripción')}>
                    Copiar descripción
                  </button>
                  <button className="btn sm" onClick={() => setPrDraft(null)}>
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          st?.upstream &&
          remote &&
          st.branch !== remote.base && (
            <div className="gwork-row">
              <span className="meta">La rama ya está en el remoto.</span>
              <button className="btn sm" disabled={!!busy} onClick={() => void pushBranch()}>
                Obtener el enlace del PR
              </button>
            </div>
          )
        )}
      </div>

      <div className="gcols">
        <div className="gleft">
          <div className="gcommit">
            <textarea
              rows={3}
              value={msg}
              placeholder={busy === 'redactando' ? 'Claude está redactando el mensaje…' : staged.length ? `Mensaje del commit (${staged.length} archivo${staged.length > 1 ? 's' : ''} preparado${staged.length > 1 ? 's' : ''})` : 'Prepara archivos para hacer un commit'}
              aria-label="Mensaje del commit"
              onChange={(e) => setMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  commit()
                }
              }}
            />
            <div className="gcommit-b">
              <button
                className="btn sm"
                disabled={!!busy || (!staged.length && !changes.length)}
                title={
                  !staged.length && !changes.length
                    ? 'No hay cambios que describir'
                    : staged.length
                      ? 'Claude redacta el mensaje a partir de los cambios preparados'
                      : 'Nada preparado: Claude describirá todos los cambios (puedes prepararlos después)'
                }
                onClick={() =>
                  void act(
                    'redactando',
                    () => window.api.call('git:message', dir).then((m) => setMsg(m)),
                    staged.length ? 'Mensaje propuesto: revísalo antes de confirmar' : 'Mensaje propuesto a partir de todos los cambios: prepara los archivos y revísalo antes de confirmar'
                  )
                }
              >
                {busy === 'redactando' ? '✦ Redactando…' : '✦ Generar con Claude'}
              </button>
              <span className="grow" />
              <button className="btn sm primary" disabled={!!busy || !staged.length || !msg.trim()} title="Ctrl+Enter" onClick={commit}>
                ✓ Confirmar
              </button>
            </div>
          </div>

          {conflicts.length > 0 && (
            <section>
              <h4 className="gh err">Conflictos · {conflicts.length}</h4>
              {conflicts.map((f) => (
                <Row key={f.path} f={f} side="work" selected={isSel(f.path, 'work')} onSelect={() => setSel({ path: f.path, kind: 'work' })} actions={null} />
              ))}
            </section>
          )}

          <section>
            <h4 className="gh">
              Preparados · {staged.length}
              {staged.length > 0 && (
                <button className="icon" title="Quitar todo de lo preparado" aria-label="Quitar todo de lo preparado" disabled={!!busy} onClick={() => void act('unstage', () => window.api.call('git:unstage', dir, staged.map((f) => f.path)))}>
                  −
                </button>
              )}
            </h4>
            {staged.map((f) => (
              <Row
                key={'s' + f.path}
                f={f}
                side="index"
                selected={isSel(f.path, 'staged')}
                onSelect={() => setSel({ path: f.path, kind: 'staged' })}
                actions={
                  <button className="icon" title="Quitar de lo preparado" aria-label="Quitar de lo preparado" disabled={!!busy} onClick={() => void act('unstage', () => window.api.call('git:unstage', dir, [f.path]))}>
                    −
                  </button>
                }
              />
            ))}
            {!staged.length && <div className="meta gempty">Nada preparado.</div>}
          </section>

          <section>
            <h4 className="gh">
              Cambios · {changes.length}
              {changes.length > 0 && (
                <button className="icon" title="Preparar todo" aria-label="Preparar todo" disabled={!!busy} onClick={() => void act('stage', () => window.api.call('git:stage', dir, changes.map((f) => f.path)))}>
                  ＋
                </button>
              )}
            </h4>
            {changes.map((f) => (
              <Row
                key={'w' + f.path}
                f={f}
                side="work"
                selected={isSel(f.path, f.untracked ? 'untracked' : 'work')}
                onSelect={() => setSel({ path: f.path, kind: f.untracked ? 'untracked' : 'work' })}
                actions={
                  <>
                    <button className="icon" title="Descartar los cambios" aria-label="Descartar los cambios" disabled={!!busy} onClick={() => discard(f)}>
                      ↶
                    </button>
                    <button className="icon" title="Preparar" aria-label="Preparar" disabled={!!busy} onClick={() => void act('stage', () => window.api.call('git:stage', dir, [f.path]))}>
                      ＋
                    </button>
                  </>
                }
              />
            ))}
            {!changes.length && !staged.length && !conflicts.length && st && <div className="meta gempty">Todo limpio: no hay cambios.</div>}
          </section>

          <section>
            <h4 className="gh clickable" onClick={() => setShowLog((s) => !s)}>
              {showLog ? '▾' : '▸'} Historial · {commits.length}
            </h4>
            {showLog &&
              commits.map((c) => (
                <div key={c.hash} className={`gcommitrow ${sel && 'hash' in sel && sel.hash === c.hash ? 'on' : ''}`} onClick={() => setSel({ hash: c.hash })} title={`${c.short} · ${c.author}`}>
                  <span className="gsub">{c.subject}</span>
                  <small>
                    {c.short} · {c.author} · {new Date(c.date).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                  </small>
                </div>
              ))}
            {showLog && !commits.length && <div className="meta gempty">Aún no hay commits.</div>}
          </section>
        </div>

        <div className="gright">
          {sel ? (
            <>
              <div className="gdiffhead">
                <b>{'hash' in sel ? `Commit ${sel.hash.slice(0, 7)}` : sel.path}</b>
                {'path' in sel && <span className="chip">{sel.kind === 'staged' ? 'preparado' : sel.kind === 'untracked' ? 'nuevo' : 'cambios'}</span>}
                {'path' in sel && task.folder && (
                  <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => void ui.run('vscode:open', st?.root ?? task.folder)}>
                    Abrir en VS Code
                  </button>
                )}
              </div>
              <DiffText text={diff} />
            </>
          ) : (
            <EmptyState kind="chart" title="Elige un archivo o un commit" text="Verás aquí qué cambió, línea por línea." />
          )}
        </div>
      </div>
    </div>
  )
}
