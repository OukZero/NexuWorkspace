import fs from 'fs'
import { dialog, shell } from 'electron'
import { commit, getDb, uid } from '../../db'
import { getMain } from '../../windows'
import type { Diagram, DiagramType } from '../../../shared/types'
import { createConversation } from './chat'

const TYPES: DiagramType[] = ['flow', 'sequence', 'class', 'state', 'er', 'bpmn']

export function listDiagrams(): Diagram[] {
  return [...(getDb().diagrams ?? [])].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function saveDiagram(p: { id?: string; title: string; type: DiagramType; code: string }): Diagram {
  if (!TYPES.includes(p.type)) throw new Error('Tipo de diagrama no válido')
  const db = getDb()
  const list = (db.diagrams ??= [])
  const now = Date.now()
  let d = p.id ? list.find((x) => x.id === p.id) : undefined
  if (d) Object.assign(d, { title: p.title.trim() || 'Sin título', type: p.type, code: p.code, updatedAt: now })
  else {
    d = { id: uid(), title: p.title.trim() || 'Sin título', type: p.type, code: p.code, createdAt: now, updatedAt: now }
    list.push(d)
  }
  commit()
  return d
}

export function deleteDiagram(id: string): Diagram[] {
  const db = getDb()
  const d = db.diagrams?.find((x) => x.id === id)
  if (d?.convId) delete db.chats[d.convId]
  db.diagrams = (db.diagrams ?? []).filter((x) => x.id !== id)
  commit()
  return listDiagrams()
}

/** Conversación de IA del diagrama (se crea al primer uso, ligada a la tarea elegida). */
export function diagramChat(id: string, taskId: string): string {
  const db = getDb()
  const d = db.diagrams?.find((x) => x.id === id)
  if (!d) throw new Error('Diagrama no encontrado')
  if (d.convId && db.chats[d.convId]) return d.convId
  d.convId = createConversation(taskId, 'diagram')
  d.taskId = taskId
  commit()
  return d.convId
}

const KIND: Record<DiagramType, string> = {
  flow: 'diagrama de flujo',
  sequence: 'diagrama de secuencia UML',
  class: 'diagrama de clases UML',
  state: 'diagrama de estados UML',
  er: 'diagrama entidad-relación',
  bpmn: 'proceso BPMN 2.0 en XML (con la sección bpmndi para que se dibuje)'
}

/** Figuras y tipos de conexión válidos por tipo (deben coincidir con renderer/diagramModel.ts). */
const VOCAB: Record<Exclude<DiagramType, 'bpmn'>, string> = {
  flow: 'shape: start | process | decision | io | subprocess | doc | db | end | note. style de conexión: arrow | line | dashed. En las decisiones etiqueta cada salida ("Sí"/"No").',
  class: 'shape: class | interface | note. "rows": miembros de la clase, una cadena por línea ("+ nombre: String"); la cadena "--" separa atributos de métodos. style: association | arrow | inherit (from = hija, to = padre) | realize (from = implementa, to = interfaz) | compose (from = todo) | aggregate (from = todo) | dashed (dependencia).',
  state: 'shape: initial | state | choice | final | note. Una sola initial. style: arrow | dashed. Etiqueta las transiciones con el evento.',
  er: 'shape: entity | note. "rows": atributos de la entidad, uno por cadena ("id (PK)", "cliente_id (FK)"). style: 1-1 | 1-N | N-1 | N-N (cardinalidad from-to).',
  sequence: 'shape: participant | actor. Los mensajes (edges) van en orden cronológico. style: sync | async | return (respuesta, punteada). "from" y "to" pueden ser el mismo participante.'
}

/** Instrucciones para la IA en conversaciones de diagrama: responde con un bloque de código que la ventana aplica. */
export function diagramNote(convId: string): string {
  const d = getDb().diagrams?.find((x) => x.convId === convId)
  if (d && d.type !== 'bpmn') {
    const json = d.code.trim().startsWith('{')
    return [
      `Estás ayudando a crear un ${KIND[d.type]} que el usuario edita con figuras. No edites archivos: responde con el diagrama completo en UN solo bloque \`\`\`json y, fuera del bloque, una o dos frases de explicación.`,
      'Formato: {"nodes":[{"id":"a","shape":"…","label":"Texto","rows":["…"]}],"edges":[{"from":"a","to":"b","label":"","style":"…"}]}. No pongas coordenadas: la ventana coloca las figuras. Cada edge usa ids de nodes que existan.',
      VOCAB[d.type],
      'Si te piden cambios, devuelve el diagrama entero actualizado, no un fragmento, conservando los ids. Usa etiquetas en español salvo que se indique otra cosa.',
      d.code.trim() ? `Diagrama actual${json ? '' : ' (en código Mermaid antiguo: conviértelo al formato JSON)'}:\n\`\`\`${json ? 'json' : 'mermaid'}\n${d.code}\n\`\`\`` : ''
    ].filter(Boolean).join('\n')
  }
  return [
    `Estás ayudando a crear un ${d ? KIND[d.type] : 'diagrama'}. No edites archivos: responde con el diagrama completo en UN solo bloque \`\`\`xml y, fuera del bloque, una o dos frases de explicación.`,
    'Si te piden cambios, devuelve el diagrama entero actualizado, no un fragmento. Usa etiquetas en español salvo que se indique otra cosa.',
    d?.code.trim() ? `Diagrama actual:\n\`\`\`xml\n${d.code}\n\`\`\`` : ''
  ].filter(Boolean).join('\n')
}

/** Guarda el diagrama exportado (SVG/PNG/código) donde elija el usuario. PNG llega en base64. */
export async function exportDiagram(name: string, format: 'svg' | 'png' | 'mmd' | 'bpmn', content: string): Promise<string | null> {
  const base = name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'diagrama'
  const opts = { defaultPath: `${base}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] }
  const main = getMain()
  const res = main ? await dialog.showSaveDialog(main, opts) : await dialog.showSaveDialog(opts)
  if (res.canceled || !res.filePath) return null
  fs.writeFileSync(res.filePath, format === 'png' ? Buffer.from(content, 'base64') : content, 'utf8' as BufferEncoding)
  shell.showItemInFolder(res.filePath)
  return res.filePath
}
