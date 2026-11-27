import fs from 'fs'
import type { ArchDoc } from '../../../shared/types'
import { commit, getDb, uid } from '../../db'
import { askClaude } from './summary'

const SCOPES: Record<ArchDoc['scope'], string> = {
  small: 'PEQUEÑO (prototipo o herramienta interna, 1 persona, prima la simplicidad y la rapidez)',
  medium: 'MEDIANO (producto con varios usuarios y un equipo pequeño, prima el equilibrio)',
  large: 'GRANDE (producción crítica, varios equipos, escala y operación importan)'
}

const STEPS: Record<string, string> = {
  start: 'Paso 1 · ACLARAR. Resume en 3 líneas lo que entendiste y haz como máximo 5 preguntas cortas y numeradas sobre lo que falte para decidir (usuarios, volumen de datos, integraciones, restricciones, equipo, plazos, presupuesto). No propongas arquitectura todavía.',
  options: 'Paso 2 · OPCIONES. Propón 2 o 3 arquitecturas adecuadas a este tipo de solución y a este alcance (incluye siempre una opción simple y una más ambiciosa). Para cada una: nombre, idea en 2 líneas, un diagrama ASCII o mermaid breve, cuándo conviene, ventajas, riesgos y esfuerzo aproximado. Termina indicando cuál recomiendas y por qué.',
  compare: 'Paso 3 · COMPARAR. Haz una tabla markdown que compare las opciones propuestas en: complejidad, coste, tiempo de entrega, escalabilidad, mantenibilidad, riesgo y encaje con el equipo. Marca el ganador por criterio y da un veredicto final de una línea.',
  decide: 'Paso 4 · DETALLAR. Con la opción elegida por el usuario (o la que recomendaste si no dijo otra), detalla: componentes y responsabilidades, flujo de datos, modelo de datos principal, contratos/endpoints clave, estructura de carpetas, seguridad, observabilidad, pruebas y un plan de implementación por fases con hitos pequeños.',
  adr: 'Paso 5 · ADR. Redacta un Architecture Decision Record en markdown: Título, Estado, Contexto, Decisión, Alternativas descartadas (con el porqué), Consecuencias (positivas y negativas) y Próximos pasos.',
  free: 'Responde a lo que el usuario pregunta ahora, manteniéndote coherente con lo ya decidido y señalando si lo nuevo cambia alguna decisión anterior.'
}

export const listArch = (): ArchDoc[] => (getDb().architectures ??= []).slice().sort((a, b) => b.updatedAt - a.updatedAt)

export function saveArch(p: Pick<ArchDoc, 'title' | 'kind' | 'scope' | 'dir' | 'brief'> & { id?: string }): ArchDoc {
  const list = (getDb().architectures ??= [])
  const scope = p.scope in SCOPES ? p.scope : 'medium'
  // la dirección quita las comillas que trae «Copiar como ruta» de Windows
  const fields = { title: p.title.trim().slice(0, 120) || 'Sin título', kind: p.kind.trim().slice(0, 60) || 'otro', scope, dir: p.dir.trim().replace(/^"|"$/g, ''), brief: p.brief.trim().slice(0, 8000) }
  const cur = p.id ? list.find((d) => d.id === p.id) : undefined
  if (cur) {
    Object.assign(cur, fields, { updatedAt: Date.now() })
    commit()
    return cur
  }
  const now = Date.now()
  const doc: ArchDoc = { id: uid(), ...fields, messages: [], createdAt: now, updatedAt: now }
  list.push(doc)
  commit()
  return doc
}

export function deleteArch(id: string): ArchDoc[] {
  const db = getDb()
  db.architectures = (db.architectures ?? []).filter((d) => d.id !== id)
  commit()
  return listArch()
}

/** Un turno de la conversación guiada. Claude solo lee el proyecto (si hay carpeta); no edita nada. */
export async function askArch(id: string, step: string, text?: string): Promise<ArchDoc> {
  const doc = (getDb().architectures ?? []).find((d) => d.id === id)
  if (!doc) throw new Error('Diseño no encontrado')
  const instruction = STEPS[step] ?? STEPS['free']!
  const user = (text ?? '').trim()
  // se reenvía el historial recortado: cada turno es una llamada independiente y así no se pierde el hilo
  const history = doc.messages.slice(-12).map((m) => `${m.role === 'user' ? 'USUARIO' : 'ARQUITECTO'}: ${m.text.slice(0, 6000)}`).join('\n\n')
  // una ruta mala ya no se ignora en silencio: el usuario cree que Claude leyó el proyecto y no es así
  if (doc.dir && !fs.existsSync(doc.dir)) throw new Error(`La carpeta del proyecto no existe: ${doc.dir}`)
  const dir = doc.dir
  const prompt = [
    'Eres un arquitecto de software senior que guía al usuario paso a paso. Responde en español, claro y sin relleno, en markdown.',
    'Adapta la complejidad al alcance: no propongas microservicios o Kubernetes a un prototipo, ni un monolito sin más a un sistema crítico. Justifica cada recomendación con sus trade-offs.',
    `TÍTULO: ${doc.title}`,
    `TIPO DE SOLUCIÓN: ${doc.kind}`,
    `ALCANCE: ${SCOPES[doc.scope]}`,
    `DESCRIPCIÓN DEL USUARIO:\n${doc.brief || '(sin descripción)'}`,
    dir ? `Hay un proyecto existente en ${dir}: léelo (Read/Glob/Grep, solo lectura) para ver su stack y estructura, y propón algo coherente con él.` : 'No hay proyecto existente: es un diseño desde cero.',
    history ? `CONVERSACIÓN PREVIA:\n${history}` : '',
    user ? `MENSAJE DEL USUARIO:\n${user}` : '',
    `INSTRUCCIÓN DE ESTE TURNO:\n${instruction}`
  ].filter(Boolean).join('\n\n')
  const out = await askClaude(prompt, getDb().settings.claudeCmd, 600000, 'sonnet', undefined, undefined, dir ? { cwd: dir } : undefined)
  const now = Date.now()
  const label = user || { start: 'Empezar: aclarar requisitos', options: 'Proponer opciones', compare: 'Comparar opciones', decide: 'Elegir y detallar', adr: 'Generar ADR' }[step] || ''
  if (label) doc.messages.push({ role: 'user', text: label, at: now })
  doc.messages.push({ role: 'assistant', text: out.replace(/\r/g, '').trim(), at: now })
  doc.updatedAt = now
  commit()
  return doc
}
