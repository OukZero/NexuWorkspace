import type { AgentTeam } from '../../../shared/types'
import { api } from '../../api'
import { commit, getDb } from '../../db'
import { askClaude } from '../ai/summary'
import { DEFAULT_ESTIMATE_TEMPLATES, detectLevel } from '../../../shared/estimateTemplates'
import type { EstimateLevel } from '../../../shared/estimateTemplates'

/** Equipo inicial: tres agentes de ejemplo y un personaje base, para que la pantalla no empiece vacía. */
const DEFAULT_TEAM: AgentTeam = {
  character: { name: 'Tú', role: 'Líder del equipo', skin: '#f2c9a5', hair: 'corto', gear: 'lentes', outfit: 'sudadera' },
  agents: [
    { id: 'revisor', name: 'Revisor de código', emoji: '🔎', color: '#5fe3b4', model: 'sonnet', prompt: 'Eres el revisor del equipo. Busca errores, riesgos de seguridad y código innecesario; responde con hallazgos concretos y cómo corregirlos.', skills: ['review', 'seguridad'] },
    { id: 'estimador', name: 'Estimador', emoji: '📐', color: '#ffb868', model: 'sonnet', prompt: 'Eres el estimador del equipo. Divide el requerimiento en tareas y cubica en horas, usando la estimación de referencia como regla.', skills: ['cubicación'] },
    { id: 'qa', name: 'QA', emoji: '🧪', color: '#ff7a9c', model: 'haiku', prompt: 'Eres QA. Propón casos de prueba y de regresión para el cambio descrito.', skills: ['tests'] }
  ],
  decor: ['🪴', '🐈', '📚']
}

const MODELS = ['haiku', 'sonnet', 'opus']

export function registerTeamIpc(): void {
  api('team:get', () => getDb().agentTeam ?? DEFAULT_TEAM)
  api('team:save', (t) => {
    getDb().agentTeam = t
    commit()
  })
  api('team:ask', async (id, message) => {
    const team = getDb().agentTeam ?? DEFAULT_TEAM
    const a = team.agents.find((x) => x.id === id)
    if (!a) throw new Error('Agente no encontrado.')
    if (!message.trim()) throw new Error('Escribe un mensaje.')
    // solo se llama a petición del usuario; el modelo lo elige cada agente
    // si tiene grupo de carpetas, trabaja en la primera carpeta y ve el resto con --add-dir
    const group = (getDb().groups ?? []).find((g) => g.id === team.chatGroupId)
    const folders = (group?.folders ?? []).filter((f) => f.path)
    const scope = folders.length ? `\n\nCarpetas del grupo «${group?.name}»:\n${folders.map((f) => `- ${f.path} (${f.access === 'write' ? 'lectura y escritura' : 'solo lectura: no la modifiques'})`).join('\n')}` : ''
    // el estimador recibe la plantilla del nivel pedido (técnica/comercial); si no se distingue, ambas
    let tpl = ''
    if (a.id === 'estimador' || a.skills.includes('cubicación')) {
      const level = detectLevel(message)
      const get = (l: EstimateLevel): string => team.estimateTemplates?.[l]?.trim() || DEFAULT_ESTIMATE_TEMPLATES[l]
      tpl = level
        ? `\n\nEstimación ${level === 'technical' ? 'técnica' : 'comercial'}. Entrega el resultado siguiendo EXACTAMENTE esta plantilla:\n${get(level)}`
        : `\n\nSegún lo que pida el usuario, usa la plantilla técnica o la comercial (si no está claro, usa la técnica y dilo):\n--- PLANTILLA TÉCNICA ---\n${get('technical')}\n--- PLANTILLA COMERCIAL ---\n${get('commercial')}`
    }
    const prompt = `${a.prompt}\n\nSkills activas: ${a.skills.join(', ') || 'ninguna'}.${scope}${tpl}\n\n---\n${message}`
    const dirs = folders.length ? { cwd: folders[0].path, extra: folders.slice(1).map((f) => f.path) } : undefined
    return askClaude(prompt, getDb().settings.claudeCmd, 180000, MODELS.includes(a.model) ? a.model : 'sonnet', dirs)
  })
  // decide qué agente atiende una solicitud del chat general: una llamada corta a Haiku y, si falla, por palabras clave
  api('team:route', async (message) => {
    const agents = (getDb().agentTeam ?? DEFAULT_TEAM).agents
    if (!agents.length) throw new Error('Crea un agente primero.')
    if (!message.trim()) throw new Error('Escribe una solicitud.')
    if (agents.length === 1) return { agentId: agents[0].id, reason: 'Es el único agente del equipo.' }
    const list = agents.map((a) => `- id: ${a.id} | ${a.name} | skills: ${a.skills.join(', ') || '—'} | ${a.prompt.replace(/\s+/g, ' ').slice(0, 220)}`).join('\n')
    const prompt = `Eres el coordinador de un equipo de agentes. Elige el agente más adecuado para la solicitud.\n\nAgentes:\n${list}\n\nSolicitud:\n${message.slice(0, 3000)}\n\nResponde SOLO con JSON en una línea: {"id":"<id del agente>","reason":"<motivo breve en español, máx. 12 palabras>"}`
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
