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
