// Revisión de código con IA: abre una conversación de solo lectura con el prompt definido en shared/review.ts
// y el contexto completo (tarea, issue, rama y diff contra la base, que es lo que verá quien revise el PR).
import { REVIEW_TITLE, reviewPrompt } from '../../../shared/review'
import { commit, getDb } from '../../db'
import * as chat from '../ai/chat'
import { buildContext, repoDirOf, taskById } from '../ai/context'
import * as g from './git'

export async function startReview(taskId: string, dir?: string): Promise<string> {
  const task = taskById(taskId)
  const repo = dir || (await repoDirOf(task))
  if (!repo) throw new Error('La tarea no tiene un repositorio de Git que revisar.')
  const branch = (await g.currentBranch(repo)) || 'HEAD'
  const base = await g.baseBranch(repo)

  // lo que aporta la rama; si no hay nada confirmado todavía, se revisa lo que está sin confirmar
  const against = await g.diffAgainstBase(repo, 1)
  const pending = await g.diffPending(repo, 1)
  if (against.empty && pending.empty) throw new Error(`No hay nada que revisar: la rama «${branch}» no tiene cambios respecto a «${base}» ni cambios sin confirmar.`)
  const kinds = against.empty ? (['task', 'branch', 'status', 'diff'] as const) : pending.empty ? (['task', 'branch', 'status', 'base'] as const) : (['task', 'branch', 'status', 'base', 'diff'] as const)
  const ctx = await buildContext(task, { kinds: [...kinds] })

  const prompt = reviewPrompt({ context: ctx.text, base, branch, extra: getDb().settings.reviewInstructions })
  const convId = chat.createConversation(taskId, 'review')
  const c = getDb().chats[convId]
  c.title = REVIEW_TITLE
  commit()
  const shown = `${REVIEW_TITLE} de «${branch}» frente a «${base}»${task.issue ? ` · issue #${task.issue.number}` : ''}`
  chat.send(convId, shown, undefined, { model: prompt, labels: ctx.labels })
  return convId
}
