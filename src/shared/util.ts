export const pad = (n: number): string => String(n).padStart(2, '0')

export const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/**
 * Carpeta en la que trabaja una tarea: la suya o, si no tiene, la primera carpeta con permiso de escritura de sus grupos.
 * (Las de solo lectura no sirven: Claude no podría editar en la carpeta de trabajo.) '' si no hay ninguna.
 */
export function workFolder(task: { folder?: string; groupIds?: string[] }, groups: Array<{ id: string; folders: Array<{ path: string; access: string }> }>, exists?: (p: string) => boolean): string {
  const own = (task.folder ?? '').trim()
  if (own) return own
  for (const id of task.groupIds ?? []) {
    for (const f of groups.find((g) => g.id === id)?.folders ?? []) {
      if (f.access === 'write' && (!exists || exists(f.path))) return f.path
    }
  }
  return ''
}

export const clip =(s: unknown, n: number): string => {
  const str = String(s ?? '')
  return str.length > n ? str.slice(0, n) + '…' : str
}

/** Suma la duración de varios tramos [inicio, fin] en ms uniendo los que se solapan (para no contar dos veces el mismo tiempo). */
export function mergedMs(spans: Array<[number, number]>): number {
  const sorted = spans.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0])
  let total = 0
  let cur: [number, number] | null = null
  for (const [s, e] of sorted) {
    if (cur && s <= cur[1]) cur[1] = Math.max(cur[1], e)
    else {
      if (cur) total += cur[1] - cur[0]
      cur = [s, e]
    }
  }
  if (cur) total += cur[1] - cur[0]
  return total
}

/** Dirección escrita por el usuario → URL http(s) válida; null si no lo es. Sin esquema se asume https (http en localhost y direcciones IP). */
export function normalizeWebUrl(input: string): string | null {
  const t = input.trim()
  if (!t || /\s/.test(t)) return null
  try {
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t)
    const local = /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#]|$)/i.test(t)
    const u = new URL(hasScheme ? t : `${local ? 'http' : 'https'}://${t}`)
    const okProtocol = u.protocol === 'https:' || u.protocol === 'http:'
    return okProtocol && (u.hostname.includes('.') || u.hostname === 'localhost') ? u.toString() : null
  } catch {
    return null
  }
}
