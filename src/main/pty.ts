// Terminal integrada: cada pestaña del panel es un shell real (ConPTY de Windows) en la carpeta de la tarea.
import { spawn } from 'child_process'
import fs from 'fs'
import * as nodePty from 'node-pty'
import type { Task } from '../shared/types'
import { getDb } from './db'
import { effectiveTask, groupAccess } from './groups'
import { emit } from './windows'

interface Session {
  proc: nodePty.IPty
  taskId: string
}

const sessions = new Map<string, Session>()
let seq = 0

export function createPty(original: Task, cols: number, rows: number, sessionId?: string): { id: string; title: string } {
  const task = effectiveTask(original)
  if (!task.folder || !fs.existsSync(task.folder)) throw new Error('La carpeta del proyecto no existe: ' + (task.folder || '(vacía)'))
  const { settings } = getDb()
  const cmd = settings.terminal === 'cmd'
  const proc = nodePty.spawn(cmd ? 'cmd.exe' : 'powershell.exe', cmd ? [] : ['-NoLogo'], {
    name: 'xterm-256color',
    cols: Math.max(20, Math.floor(cols) || 100),
    rows: Math.max(5, Math.floor(rows) || 24),
    cwd: task.folder,
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string>
  })
  const id = `pty${++seq}`
  sessions.set(id, { proc, taskId: task.id })
  proc.onData((data) => emit('pty:data', { id, data }))
  proc.onExit(({ exitCode }) => {
    sessions.delete(id)
    emit('pty:exit', { id, code: exitCode })
  })
  // retomar la conversación de Claude de la tarea, con los mismos grupos de carpetas
  if (sessionId && /^[\w-]+$/.test(sessionId)) {
    proc.write(`${settings.claudeCmd} --resume ${sessionId} ${groupAccess(task).args.join(' ')}`.trim() + '\r')
  }
  return { id, title: sessionId ? 'Claude' : cmd ? 'cmd' : 'PowerShell' }
}

export const writePty = (id: string, data: string): void => sessions.get(id)?.proc.write(data)

export function resizePty(id: string, cols: number, rows: number): void {
  try {
    sessions.get(id)?.proc.resize(Math.max(20, Math.floor(cols)), Math.max(5, Math.floor(rows)))
  } catch {
    /* el proceso ya terminó */
  }
}

export function killPty(id: string): void {
  const s = sessions.get(id)
  if (!s) return
  sessions.delete(id)
  // taskkill del árbol: proc.kill() lanza un agente auxiliar que en Windows falla con «AttachConsole failed»
  spawn('taskkill', ['/pid', String(s.proc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {})
}

/** Al borrar una tarea o salir de la app no deben quedar shells huérfanos. */
export function killPtysOf(taskId?: string): void {
  for (const [id, s] of [...sessions]) if (!taskId || s.taskId === taskId) killPty(id)
}
