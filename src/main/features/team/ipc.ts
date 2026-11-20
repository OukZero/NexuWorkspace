import type { AgentTeam } from '../../../shared/types'
import { api } from '../../api'
import { commit, getDb } from '../../db'
import { askClaude } from '../ai/summary'

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
    const prompt = `${a.prompt}\n\nSkills activas: ${a.skills.join(', ') || 'ninguna'}.\n\n---\n${message}`
    return askClaude(prompt, getDb().settings.claudeCmd, 180000, MODELS.includes(a.model) ? a.model : 'sonnet')
  })
}
