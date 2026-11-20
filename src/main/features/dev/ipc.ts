import { api } from '../../api'
import { getDb } from '../../db'
import { taskById as findTask } from '../ai/context'
import * as checks from './checks'
import * as ci from './ci'
import * as files from './files'
import * as forge from './forge'
import * as git from './git'
import { gitCommits, launchTask, openTerminalHere } from './launch'
import { createPty, killPty, resizePty, writePty } from './pty'
import { startReview } from './review'

/** Git, GitHub, CI, comprobaciones, archivos, terminal y lanzadores de proyecto. */
export function registerDevIpc(): void {
  api('launch:run', (taskId, itemId) => launchTask(taskId, itemId))
  api('review:start', (taskId, dir) => startReview(taskId, dir))
  api('check:list', (taskId) => checks.listChecks(findTask(taskId)))
  api('check:run', (taskId, name, convId) => checks.runCheck(findTask(taskId), name, convId ? getDb().chats[convId]?.worktree?.dir : undefined))

  api('files:roots', (taskId) => files.roots(taskId))
  api('files:list', (taskId, root, rel) => files.list(taskId, root, rel))
  api('files:read', (taskId, root, rel) => files.read(taskId, root, rel))
  api('files:find', (taskId, root, q) => files.find(taskId, root, q))

  // ---------- terminal ----------
  api('terminal:open', (taskId, sessionId) => openTerminalHere(findTask(taskId), sessionId))
  api('pty:create', (taskId, cols, rows, sessionId) => createPty(findTask(taskId), cols, rows, sessionId))
  api('pty:write', (id, data) => writePty(id, data))
  api('pty:resize', (id, cols, rows) => resizePty(id, cols, rows))
  api('pty:kill', (id) => killPty(id))

  // ---------- control de Git ----------
  api('git:repos', (taskId) => git.repos(findTask(taskId)))
  api('git:init', (dir) => git.init(dir))
  api('git:status', (dir) => git.status(dir))
  api('git:diff', (dir, file, kind) => git.diff(dir, file, kind))
  api('git:stage', (dir, paths) => git.stage(dir, paths))
  api('git:unstage', (dir, paths) => git.unstage(dir, paths))
  api('git:discard', (dir, tracked, untracked) => git.discard(dir, tracked, untracked))
  api('git:commit', (dir, message) => git.commit(dir, message))
  api('git:message', (dir) => git.commitMessage(dir))
  api('git:branches', (dir) => git.branches(dir))
  api('git:checkout', (dir, name, create) => git.checkout(dir, name, create))
  api('git:sync', (dir, op) => git.sync(dir, op))
  api('git:log', (dir, n) => git.log(dir, n))
  api('git:show', (dir, hash) => git.show(dir, hash))
  api('git:commits', async (day) => {
    const folders = [...new Set(getDb().tasks.map((t) => t.folder).filter(Boolean))]
    const out: Record<string, string[]> = {}
    for (const f of folders) {
      const c = await gitCommits(f, day)
      if (c.length) out[f] = c
    }
    return out
  })

  // ---------- GitHub: ramas, PR, issues y CI ----------
  api('git:remote', (dir) => forge.remoteInfo(dir))
  api('git:push', (dir, taskId) => forge.pushWithPr(dir, taskId))
  api('git:prText', (dir, taskId) => forge.prText(dir, taskId))
  api('ci:all', () => ci.allCi())
  api('ci:refresh', (taskId) => ci.refreshCi(taskId))
  api('ci:failure', (taskId) => ci.failureText(taskId))
  api('issue:list', (dir) => forge.listIssues(dir))
  api('issue:create', (dir, title, body, labels) => forge.createIssue(dir, title, body, labels))
  api('issue:branch', (taskId, dir, n) => forge.branchFromIssue(taskId, dir, n))
  api('issue:link', (taskId, issue) => forge.linkIssue(taskId, issue))
  api('task:branch', (taskId, dir, name) => forge.branchForTask(taskId, dir, name))
}
