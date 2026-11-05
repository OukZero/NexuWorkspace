import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { GitStatus } from '../../../shared/types'

/** Barra inferior (como la de VS Code): rama de Git de la tarea activa, cambios pendientes y sincronización. */
export function StatusBar({ taskId, onOpenGit }: { taskId: string; onOpenGit: () => void }): ReactNode {
  const [st, setSt] = useState<GitStatus | null>(null)
  const [repoName, setRepoName] = useState('')
  const dirRef = useRef('')

  useEffect(() => {
    let alive = true
    setSt(null)
    dirRef.current = ''

    const refresh = async (): Promise<void> => {
      try {
        if (!dirRef.current) {
          const repos = await window.api.call('git:repos', taskId)
          const r = repos.find((x) => x.isRepo)
          if (!alive) return
          if (!r) return setSt(null)
          dirRef.current = r.dir
          setRepoName(r.name)
        }
        const s = await window.api.call('git:status', dirRef.current)
        if (alive) setSt(s)
      } catch {
        if (alive) setSt(null)
      }
    }

    void refresh()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 5000)
    const onFocus = (): void => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      alive = false
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [taskId])

  if (!st) return null
  const dirty = st.files.length

  return (
    <div className="statusbar">
      <button className="sb-branch" onClick={onOpenGit} title={`Rama «${st.branch}» en ${repoName}${st.upstream ? ` · sigue a ${st.upstream}` : ''}\nClic para abrir Git`}>
        <span aria-hidden>⎇</span> {st.branch || 'HEAD'}
        {dirty > 0 && (
          <span className="sb-dirty" title={`${dirty} archivo${dirty === 1 ? '' : 's'} con cambios`}>
            ●
          </span>
        )}
      </button>
      {(st.ahead > 0 || st.behind > 0) && (
        <span className="sb-sync" title={`${st.ahead} por subir · ${st.behind} por bajar`}>
          {st.behind > 0 && `↓${st.behind} `}
          {st.ahead > 0 && `↑${st.ahead}`}
        </span>
      )}
      <span className="sb-repo">{repoName}</span>
    </div>
  )
}
