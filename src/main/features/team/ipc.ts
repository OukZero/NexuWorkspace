import type { AgentTeam, Attachment, TeamOrchestration } from '../../../shared/types'
import { attachRoot, trusted } from '../ai/attachments'
import { AGENT_TEMPLATES, ORCHESTRATOR_ID } from '../../../shared/teamTemplates'
import fs from 'fs'
import { execFileSync } from 'child_process'
import { api } from '../../api'
import { broadcast, commit, getDb } from '../../db'
import { notify } from '../../notify'
import { askClaude, type AskRun } from '../ai/summary'
import { DEFAULT_ESTIMATE_TEMPLATES, detectLevel } from '../../../shared/estimateTemplates'
import type { EstimateLevel } from '../../../shared/estimateTemplates'

/** Equipo inicial: los agentes de plantilla y un personaje base, para que la pantalla no empiece vacía. */
const DEFAULT_TEAM: AgentTeam = {
  character: { name: 'Tú', role: 'Líder del equipo', skin: '#f2c9a5', hair: 'corto', gear: 'lentes', outfit: 'sudadera' },
  agents: AGENT_TEMPLATES,
  decor: ['🪴', '🐈', '📚']
}

const MODELS = ['haiku', 'sonnet', 'opus']

/** Ejecuciones en curso: `team:cancel` las aborta (y mata el árbol de procesos de claude). */
const running = new Set<AbortController>()

/** Ejecuta `fn` con una señal de cancelación; si tardó más de 20 s avisa al terminar (el usuario suele estar en otra vista). */
async function tracked<T>(label: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController()
  running.add(ctl)
  const t0 = Date.now()
  try {
    const r = await fn(ctl.signal)
    if (Date.now() - t0 > 20000 && !ctl.signal.aborted) notify({ kind: 'done', title: 'El equipo terminó', body: label, goto: 'team', tg: false })
    return r
  } finally {
    running.delete(ctl)
  }
}

/** Conversación previa del chat de equipo (la arma el renderer): sin ella «hazlo con la 1 y la 3» no significa nada para el agente. */
const histBlock = (h?: string): string => (h?.trim() ? `Conversación reciente (contexto; la solicitud actual puede referirse a ella):
${h.slice(-14000)}

` : '')

/** Ejecuta un agente. Si puede editar, trabaja dentro de su carpeta; sin carpeta elegida se rechaza para no tocar nada por accidente. */
function runAgent(a: AgentTeam['agents'][number], prompt: string, attached: Attachment[] | undefined, signal: AbortSignal, convDir?: string): Promise<string> {
  const run: AskRun = { signal, onProgress: (text) => broadcast('team:progress', { agentId: a.id, text }) }
  const model = MODELS.includes(a.model) ? a.model : 'sonnet'
  const cmd = getDb().settings.claudeCmd
  // documentos de referencia del agente + adjuntos de la solicitud: se mencionan por ruta y el agente los lee con Read
  const refs = trusted(a.refs)
  const files = trusted(attached)
  const list = (l: Attachment[]): string => l.map((f) => `- ${f.path}`).join('\n')
  if (refs.length) prompt += `\n\nDocumentos de referencia (léelos antes de responder y úsalos como regla):\n${list(refs)}`
  if (files.length) prompt += `\n\nArchivos adjuntos a la solicitud (léelos, también las imágenes):\n${list(files)}`
  const readDir = refs.length || files.length ? attachRoot() : undefined
  // carpeta del proyecto: la del agente o, si no tiene, la del primer agente que edita código (así todos pueden leer el código)
  // La carpeta de la conversación manda para todos; sin ella, la del agente o la del primero que edita.
  const team = getDb().agentTeam
  const conv = convDir && fs.existsSync(convDir) ? convDir : undefined
  const dir = [conv, a.workdir, ...(team?.agents.filter((x) => x.canEdit).map((x) => x.workdir) ?? [])].find((d) => d && fs.existsSync(d))
  if (dir) prompt = `Carpeta del proyecto de esta conversación: ${dir}\n(tu directorio de trabajo es esa carpeta; todos los agentes del equipo trabajan sobre ella).\n\n${prompt}`
  if (!a.canEdit) return askClaude(prompt, cmd, 180000, model, undefined, readDir, dir ? { ...run, cwd: dir } : run)
  const wd = conv ?? a.workdir
  if (!wd || !fs.existsSync(wd)) throw new Error(`${a.name} necesita una carpeta de trabajo: elígela arriba del chat o en su editor.`)
  return askClaude(prompt, cmd, 600000, model, { cwd: wd }, readDir, run)
}

export function registerTeamIpc(): void {
  api('team:get', () => getDb().agentTeam ?? DEFAULT_TEAM)
  api('team:save', (t) => {
    getDb().agentTeam = t
    commit()
  })
  api('team:ask', async (id, message, files, history, convDir) => {
    const team = getDb().agentTeam ?? DEFAULT_TEAM
    const a = team.agents.find((x) => x.id === id)
    if (!a) throw new Error('Agente no encontrado.')
    if (!message.trim() && !files?.length) throw new Error('Escribe un mensaje.')
    // solo se llama a petición del usuario; el modelo lo elige cada agente
    // el estimador recibe la plantilla del nivel pedido (técnica/comercial); si no se distingue, ambas
    let tpl = ''
    if (a.id === 'estimador' || a.skills.includes('cubicación')) {
      const level = detectLevel(message)
      const get = (l: EstimateLevel): string => team.estimateTemplates?.[l]?.trim() || DEFAULT_ESTIMATE_TEMPLATES[l]
      tpl = level
        ? `\n\nEstimación ${level === 'technical' ? 'técnica' : 'comercial'}. Entrega el resultado siguiendo EXACTAMENTE esta plantilla:\n${get(level)}`
        : `\n\nSegún lo que pida el usuario, usa la plantilla técnica o la comercial (si no está claro, usa la técnica y dilo):\n--- PLANTILLA TÉCNICA ---\n${get('technical')}\n--- PLANTILLA COMERCIAL ---\n${get('commercial')}`
    }
    const prompt = `${a.prompt}\n\nUsa estas skills cuando la tarea encaje: ${a.skills.join(', ') || 'ninguna'}.\n\n${tpl}

${histBlock(history)}---\n${message || 'Revisa los archivos adjuntos.'}`
    return tracked(`${a.name} respondió.`, (signal) => runAgent(a, prompt, files, signal, convDir))
  })
  // QA bajo demanda (cuesta tokens, nunca automático): recibe el diff y prueba solo lo afectado con la app en modo de pruebas
  api('team:qa', async (dirArg) => {
    const team = getDb().agentTeam ?? DEFAULT_TEAM
    const a = team.agents.find((x) => x.id === 'qa') ?? AGENT_TEMPLATES.find((x) => x.id === 'qa')
    if (!a) throw new Error('No hay un agente QA en el equipo.')
    const dir = [dirArg, a.workdir, ...team.agents.map((x) => x.workdir)].find((d) => d && fs.existsSync(d))
    if (!dir) throw new Error('El agente QA necesita la carpeta del proyecto: elígela en su editor.')
    const git = (...args: string[]): string => {
      try {
        return execFileSync('git', args, { cwd: dir, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, windowsHide: true })
      } catch {
        return ''
      }
    }
    // cambios sin confirmar; si no hay, el último commit
    let from = 'los cambios sin confirmar'
    let stat = git('diff', 'HEAD', '--stat')
    let diff = git('diff', 'HEAD')
    if (!diff.trim()) {
      from = 'el último commit'
      stat = git('show', '--stat', '--format=%s', 'HEAD')
      diff = git('show', '--format=%s', 'HEAD')
    }
    if (!diff.trim()) throw new Error('No hay cambios que probar.')
    const prompt = [
      a.prompt,
      `Vas a probar ${from} de este proyecto (${dir}). Resumen:\n${stat.slice(0, 4000)}`,
      `Diff (recortado):\n${diff.slice(0, 30000)}`,
      'Cómo probar:',
      '1. Deduce qué pantallas/componentes toca el diff; prueba solo esas.',
      '2. La app se prueba aislada con Playwright (carpeta tests/e2e; helpers launchApp/goTo/shot en tests/e2e/app.ts: datos temporales, sin sesión ni integraciones). Si ya hay un spec que cubra el cambio, ejecútalo con `npx playwright test <archivo>`; si no, escribe uno nuevo en tests/e2e/ (rellena formularios, navega, comprueba componentes y haz capturas con shot()). Ejecuta `npm run test:e2e` para compilar y correr todo.',
      '3. Nunca toques datos reales ni la app abierta del usuario.',
      'Responde en español con: ✅ lo que pasó, ❌ fallos (con pasos para reproducirlos y archivo probable), rutas de las capturas (test-results/screens) y los specs creados.'
    ].join('\n\n')
    return tracked('QA terminó de probar.', (signal) =>
      askClaude(prompt, getDb().settings.claudeCmd, 900000, MODELS.includes(a.model) ? a.model : 'sonnet', { cwd: dir, qa: true }, undefined, { signal, onProgress: (text) => broadcast('team:progress', { agentId: a.id, text }) })
    )
  })
  api('team:cancel', () => {
    for (const c of running) c.abort()
  })
  // el orquestador planifica (hasta 4 pasos), cada agente ejecuta su instrucción con lo anterior como contexto y al final se integra
  api('team:orchestrate', (message, files, history, convDir) => tracked('El orquestador completó la solicitud.', (signal) => orchestrate(message, files, signal, history, convDir)))
  const orchestrate = async (message: string, files: Attachment[] | undefined, signal: AbortSignal, history?: string, convDir?: string): Promise<TeamOrchestration> => {
    const team = getDb().agentTeam ?? DEFAULT_TEAM
    const boss = team.agents.find((x) => x.id === ORCHESTRATOR_ID)
    const workers = team.agents.filter((x) => x.id !== ORCHESTRATOR_ID)
    if (!workers.length) throw new Error('El orquestador necesita al menos otro agente.')
    if (!message.trim()) throw new Error('Escribe una solicitud.')
    const cmd = getDb().settings.claudeCmd
    const model = boss && MODELS.includes(boss.model) ? boss.model : 'sonnet'
    const list = workers.map((a) => `- id: ${a.id} | ${a.name}${a.canEdit ? ' (MODIFICA ARCHIVOS)' : ''} | skills: ${a.skills.join(', ') || '—'} | ${a.prompt.replace(/\s+/g, ' ').slice(0, 220)}`).join('\n')
    const plan = `${boss?.prompt ?? ''}\n\nAgentes disponibles:\n${list}\n\n${histBlock(history)}Solicitud:\n${message.slice(0, 3000)}\n\nSi la solicitud se refiere a algo de la conversación reciente (p. ej. «aplica las opciones 1, 2 y 3» sobre una lista de ideas), identifica exactamente a qué se refiere y copia el contenido relevante dentro de cada instrucción: el agente que la reciba no puede adivinarlo. Planifica como máximo 4 pasos, en orden, usando solo estos agentes (cada paso recibe los resultados anteriores). Responde SOLO con un array JSON: [{"id":"<id del agente>","task":"<instrucción concreta y autosuficiente>"}]`
    let steps: Array<{ id: string; task: string }> = []
    try {
      broadcast('team:progress', { agentId: ORCHESTRATOR_ID, text: 'Planificando los pasos…' })
      const out = await askClaude(plan, cmd, 90000, model, undefined, undefined, { signal })
      const m = out.match(/\[[\s\S]*\]/)
      const arr = m ? (JSON.parse(m[0]) as Array<{ id?: string; task?: string }>) : []
      steps = arr.filter((s) => workers.some((w) => w.id === s.id) && typeof s.task === 'string' && s.task.trim()).slice(0, 4) as typeof steps
    } catch (e) {
      if (signal.aborted) throw e
      /* sin plan válido: se usa un solo agente */
    }
    if (!steps.length) steps = [{ id: keywordRoute(workers, message).agentId, task: message }]
    const done: TeamOrchestration['steps'] = []
    for (const s of steps) {
      const a = workers.find((w) => w.id === s.id)!
      broadcast('team:progress', { agentId: a.id, text: `Paso ${done.length + 1} de ${steps.length}` })
      const prev = done.map((d) => `### ${team.agents.find((x) => x.id === d.agentId)?.name}\n${d.output.slice(0, 3500)}`).join('\n\n')
      const prompt = `${a.prompt}\n\nUsa estas skills cuando la tarea encaje: ${a.skills.join(', ') || 'ninguna'}.\n\n${histBlock(history)}Solicitud original del usuario:\n${message.slice(0, 2000)}\n${prev ? `\nResultados de pasos anteriores:\n${prev}\n` : ''}\n---\nTu instrucción del orquestador:\n${s.task}`
      // un paso que falla (p. ej. agente sin carpeta) no tira el plan entero: queda anotado y sigue
      let output: string
      try {
        output = await runAgent(a, prompt, files, signal, convDir)
      } catch (e) {
        if (signal.aborted) throw e
        output = `⚠️ No se ejecutó: ${(e as Error).message}`
      }
      done.push({ agentId: a.id, instruction: s.task, output })
    }
    // con un solo paso no hace falta otra llamada para integrar
    if (done.length === 1) return { steps: done, summary: '' }
    const all = done.map((d) => `### ${team.agents.find((x) => x.id === d.agentId)?.name}\n${d.output.slice(0, 5000)}`).join('\n\n')
    broadcast('team:progress', { agentId: ORCHESTRATOR_ID, text: 'Integrando resultados…' })
    const summary = await askClaude(`${boss?.prompt ?? ''}\n\nSolicitud del usuario:\n${message.slice(0, 2000)}\n\nResultados de los agentes:\n${all}\n\nIntégralos en una respuesta final breve y accionable, indicando qué hacer primero y señalando contradicciones si las hay.`, cmd, 120000, model, undefined, undefined, { signal })
    return { steps: done, summary }
  }
  // decide qué agente atiende una solicitud del chat general: una llamada corta a Haiku y, si falla, por palabras clave
  api('team:route', async (message, history) => {
    const agents = (getDb().agentTeam ?? DEFAULT_TEAM).agents
    if (!agents.length) throw new Error('Crea un agente primero.')
    if (!message.trim()) throw new Error('Escribe una solicitud.')
    if (agents.length === 1) return { agentId: agents[0].id, reason: 'Es el único agente del equipo.' }
    // «aplica las opciones 1 y 3», «hazlo», «adelante»…: ejecutar lo que propuso otro agente es trabajo de reparto, lo decide el orquestador sin gastar una llamada
    const boss = agents.find((x) => x.id === ORCHESTRATOR_ID)
    if (boss && history?.trim() && /\b(aplic|implement|ejecut|hazl|haz(?:lo|la|las|los)?\b|adelante|procede|llev(?:a|e)\w* a cabo|opci[oó]n(?:es)?\s*\d|idea(?:s)?\s*\d|punto(?:s)?\s*\d)/i.test(message)) {
      return { agentId: boss.id, reason: 'Aplica lo propuesto antes: el orquestador reparte el trabajo.' }
    }
    const list = agents.map((a) => `- id: ${a.id} | ${a.name} | skills: ${a.skills.join(', ') || '—'} | ${a.prompt.replace(/\s+/g, ' ').slice(0, 220)}`).join('\n')
    const prompt = `Eres el coordinador de un equipo de agentes. Elige el agente más adecuado para la solicitud.\n\nAgentes:\n${list}\n\n${histBlock(history)}Solicitud (puede referirse a la conversación anterior):\n${message.slice(0, 3000)}\n\nResponde SOLO con JSON en una línea: {"id":"<id del agente>","reason":"<motivo breve en español, máx. 12 palabras>"}`
    try {
      const out = await askClaude(prompt, getDb().settings.claudeCmd, 60000)
      const m = out.match(/\{[\s\S]*?\}/)
      const j = m ? (JSON.parse(m[0]) as { id?: string; reason?: string }) : null
      const a = j && agents.find((x) => x.id === j.id)
      if (a) return { agentId: a.id, reason: String(j?.reason ?? '').slice(0, 140) }
    } catch {
      /* sigue con el respaldo local */
    }
    return keywordRoute(agents, message)
  })
}

/** Respaldo sin IA: el agente cuyo nombre, skills o prompt comparten más palabras con la solicitud. */
function keywordRoute(agents: AgentTeam['agents'], message: string): { agentId: string; reason: string } {
  const words = (s: string): string[] => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9ñ]+/).filter((w) => w.length > 3)
  const msg = new Set(words(message))
  let best = agents[0]
  let score = -1
  for (const a of agents) {
    const s = words(`${a.name} ${a.skills.join(' ')} ${a.prompt}`).filter((w) => msg.has(w)).length
    if (s > score) [best, score] = [a, s]
  }
  return { agentId: best.id, reason: score > 0 ? 'Coincide con sus skills e instrucciones.' : 'Sin coincidencias claras: se asignó al primero.' }
}
