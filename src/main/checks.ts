// Pruebas, compilación y revisiones del proyecto de la tarea, ejecutadas desde la app.
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { CheckDef, CheckResult, Task } from '../shared/types'
import { effectiveTask } from './groups'
import { repoDirOf } from './context'

const MAX_OUT = 12000
const TIMEOUT = 10 * 60 * 1000

/** Dónde se ejecutan: la copia aislada de la conversación, si la hay; si no, la carpeta del repositorio o de la tarea. */
export async function checkDir(task: Task, worktreeDir?: string): Promise<string> {
  if (worktreeDir && fs.existsSync(worktreeDir)) return worktreeDir
  const t = effectiveTask(task)
  const repo = await repoDirOf(t).catch(() => '')
  return repo || t.folder
}

const SCRIPTS = ['test', 'build', 'lint', 'typecheck', 'check', 'format:check']

export async function listChecks(task: Task, worktreeDir?: string): Promise<CheckDef[]> {
  const dir = await checkDir(task, worktreeDir)
  if (!dir || !fs.existsSync(dir)) return []
  const out: CheckDef[] = []
  const pkg = path.join(dir, 'package.json')
  if (fs.existsSync(pkg)) {
    try {
      const scripts = (JSON.parse(fs.readFileSync(pkg, 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {}
      const runner = fs.existsSync(path.join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(dir, 'yarn.lock')) ? 'yarn' : 'npm run'
      for (const s of SCRIPTS) if (scripts[s]) out.push({ name: s, cmd: s === 'test' && runner === 'npm run' ? 'npm test' : `${runner} ${s}` })
    } catch {
      /* package.json ilegible */
    }
  }
  const has = (f: string): boolean => fs.existsSync(path.join(dir, f))
  const anyIn = (ext: string): boolean => {
    try {
      return fs.readdirSync(dir).some((f) => f.endsWith(ext))
    } catch {
      return false
    }
  }
  if (anyIn('.sln') || anyIn('.csproj')) out.push({ name: 'test', cmd: 'dotnet test' }, { name: 'build', cmd: 'dotnet build' })
  if (has('Cargo.toml')) out.push({ name: 'test', cmd: 'cargo test' }, { name: 'build', cmd: 'cargo build' })
  if (has('go.mod')) out.push({ name: 'test', cmd: 'go test ./...' }, { name: 'build', cmd: 'go build ./...' })
  if (has('pytest.ini') || has('pyproject.toml') || has('tox.ini')) out.push({ name: 'test', cmd: 'python -m pytest' })
  const seen = new Set<string>()
  return out.filter((c) => (seen.has(c.cmd) ? false : (seen.add(c.cmd), true)))
}

export async function runCheck(task: Task, name: string, worktreeDir?: string): Promise<CheckResult> {
  const def = (await listChecks(task, worktreeDir)).find((c) => c.name === name)
  if (!def) throw new Error('Ese comando no está disponible en este proyecto.')
  const dir = await checkDir(task, worktreeDir)
  const start = Date.now()
  return new Promise((resolve) => {
    // el comando sale de una lista armada por la app (no del usuario ni de la IA)
    const child = spawn(def.cmd, { shell: true, cwd: dir, windowsHide: true, env: { ...process.env, CI: '1', FORCE_COLOR: '0', NO_COLOR: '1' } })
    let buf = ''
    let truncated = false
    const take = (b: Buffer): void => {
      buf += b.toString()
      if (buf.length > MAX_OUT * 4) {
        buf = buf.slice(-MAX_OUT * 2)
        truncated = true
      }
    }
    child.stdout?.on('data', take)
    child.stderr?.on('data', take)
    const timer = setTimeout(() => {
      if (child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
      buf += '\n[Se detuvo: pasaron 10 minutos]'
    }, TIMEOUT)
    const done = (code: number | null, extra = ''): void => {
      clearTimeout(timer)
      let output = (buf + extra).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim()
      if (output.length > MAX_OUT) {
        output = output.slice(-MAX_OUT)
        truncated = true
      }
      resolve({ name: def.name, cmd: def.cmd, ok: code === 0, code, ms: Date.now() - start, output, truncated })
    }
    child.on('error', (e) => done(null, `\n${e.message}`))
    child.on('close', (code) => done(code))
  })
}
