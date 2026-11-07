// Plantillas de prompts para no escribir lo mismo cada vez.
import type { AgentProfile, ContextKind, LayoutPreset, PromptTemplate, TaskTemplate } from './types'

/** Variables que se sustituyen al enviar (las resuelve el proceso principal con los datos de la tarea). */
export const TEMPLATE_VARS: Array<[string, string]> = [
  ['{{tarea}}', 'Título de la tarea'],
  ['{{descripcion}}', 'Descripción de la tarea'],
  ['{{rama}}', 'Rama de trabajo'],
  ['{{issue}}', 'Issue vinculada (#número y título)'],
  ['{{archivos}}', 'Archivos con cambios']
]

export const CONTEXT_LABEL: Record<ContextKind, string> = {
  task: 'Tarea e issue',
  branch: 'Rama y commits',
  status: 'Archivos cambiados',
  diff: 'Diff sin confirmar',
  base: 'Diff contra la rama base',
  terminal: 'Salida de la terminal',
  notes: 'Notas de sesiones anteriores'
}

export const CONTEXT_HINT: Record<ContextKind, string> = {
  task: 'Título, descripción, subtareas e issue vinculada',
  branch: 'Rama actual y los últimos commits',
  status: 'Lista de archivos modificados (git status)',
  diff: 'Cambios sin confirmar (preparados y no preparados)',
  base: 'Todo lo que la rama aporta frente a la rama base (lo que verá quien revise el PR)',
  terminal: 'Últimas líneas de la terminal integrada (errores, resultados de tests)',
  notes: 'Lo hecho, decidido y pendiente en conversaciones anteriores de la tarea'
}

export const ALL_CONTEXT: ContextKind[] = ['task', 'branch', 'status', 'diff', 'base', 'terminal', 'notes']

/** Contexto que se anexa por defecto: lo barato y casi siempre útil. */
export const DEFAULT_CONTEXT: ContextKind[] = ['task', 'branch', 'notes']

export const DEFAULT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'plan',
    name: 'Plan de trabajo',
    pinned: true,
    ctx: ['task', 'notes'],
    text: 'Antes de tocar código, léelo y propón un plan para «{{tarea}}»: archivos a cambiar, orden de los pasos, riesgos y cómo lo probaremos. No edites nada hasta que lo apruebe.'
  },
  {
    id: 'continuar',
    name: 'Retomar donde quedé',
    pinned: true,
    ctx: ['task', 'branch', 'status', 'notes'],
    text: 'Retoma esta tarea. Con las notas de sesiones anteriores y el estado de la rama, dime en qué punto estamos, qué falta y cuál es el siguiente paso. Después empieza con él.'
  },
  {
    id: 'revisar',
    name: 'Revisar mis cambios',
    pinned: true,
    ctx: ['task', 'status', 'diff'],
    text: 'Revisa mis cambios sin confirmar: busca errores, casos límite sin cubrir y cosas que olvidé. Cita archivo:línea y propón el arreglo. No edites nada.'
  },
  {
    id: 'tests',
    name: 'Escribir tests',
    pinned: true,
    ctx: ['status', 'diff'],
    text: 'Escribe tests para los cambios realizados siguiendo el framework y el estilo que ya usa el proyecto. Cubre el camino normal, los casos límite y los errores. Ejecútalos y dime el resultado.'
  },
  {
    id: 'error',
    name: 'Depurar un error',
    pinned: true,
    ctx: ['task', 'terminal'],
    text: 'Tengo este error:\n\n[pega aquí el error o descríbelo]\n\nEncuentra la causa raíz (no el síntoma): reproduce o traza el flujo, explica por qué ocurre y propón el arreglo mínimo. Si la causa es incierta, dime qué comprobar.'
  },
  {
    id: 'explicar',
    name: 'Explicar el código',
    ctx: ['task'],
    text: 'Explícame cómo funciona el código relevante para «{{tarea}}»: flujo principal, archivos clave y decisiones de diseño. Sin repetir lo obvio.'
  },
  {
    id: 'refactor',
    name: 'Refactorizar sin cambiar comportamiento',
    ctx: ['status'],
    text: 'Refactoriza [archivo o función] para que sea más simple y legible sin cambiar su comportamiento. Haz cambios pequeños, mantén la API pública y comprueba que los tests y los tipos siguen pasando.'
  },
  {
    id: 'documentar',
    name: 'Documentar',
    ctx: ['diff', 'base'],
    text: 'Documenta lo nuevo de estos cambios: comentarios solo donde el porqué no sea evidente, y actualiza el README o la documentación si cambió el uso.'
  },
  {
    id: 'seguridad',
    name: 'Revisión de seguridad',
    ctx: ['base'],
    text: 'Revisa los cambios de la rama buscando problemas de seguridad: validación de entradas, inyección, rutas, secretos, permisos y datos sensibles en logs. Solo reporta lo que encuentres, con archivo:línea y corrección.'
  },
  {
    id: 'commit',
    name: 'Mensaje de commit',
    ctx: ['status', 'diff'],
    text: 'Escribe el mensaje de commit de los cambios actuales en formato convencional (tipo(ámbito): resumen, máx. 72 caracteres) y, si hace falta, 2 a 4 viñetas con el porqué.'
  },
  {
    id: 'pr',
    name: 'Descripción del PR',
    ctx: ['task', 'branch', 'base'],
    text: 'Redacta la descripción del PR para quien lo va a revisar: qué problema resuelve, qué cambió y por qué así, cómo probarlo paso a paso, riesgos y qué mirar primero. Si hay issue, termina con «Closes #número».'
  }
]

/** Plantillas vigentes: las del usuario o, si nunca las tocó, las predeterminadas. */
export const templatesOf = (s: { promptTemplates?: PromptTemplate[] }): PromptTemplate[] => s.promptTemplates ?? DEFAULT_TEMPLATES

/** Sustituye las variables conocidas; las demás {{x}} se dejan tal cual. */
export function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/{{\s*(\w+)\s*}}/g, (m, k: string) => (k in vars ? vars[k] : m))
}

// ---------- perfiles de agente ----------
export const DEFAULT_PROFILES: AgentProfile[] = [
  {
    id: 'p-revisor',
    name: 'Revisor',
    icon: '🔍',
    mode: 'ask',
    model: '',
    readOnly: true,
    instructions: 'Eres un revisor de código. No modifiques ni crees archivos. Lee, explica, señala riesgos y errores con archivo y línea, y propón cambios como texto.'
  },
  {
    id: 'p-refactor',
    name: 'Refactor',
    icon: '🧹',
    mode: 'agent',
    model: '',
    readOnly: false,
    instructions: 'Refactoriza sin cambiar el comportamiento: cambios pequeños y verificables, sin tocar la API pública salvo que se pida. Ejecuta las pruebas o la compilación antes de terminar.'
  },
  {
    id: 'p-tests',
    name: 'Tests',
    icon: '🧪',
    mode: 'agent',
    model: '',
    readOnly: false,
    instructions: 'Escribe y corrige pruebas. Cubre casos normales, límites y errores. No cambies el código de producción salvo para hacerlo comprobable, y dilo.'
  },
  {
    id: 'p-explorador',
    name: 'Explorador',
    icon: '🧭',
    mode: 'ask',
    model: 'haiku',
    readOnly: true,
    instructions: 'Explora el proyecto y responde con precisión y brevedad, citando archivos. No edites nada.'
  }
]
export const profilesOf = (s: { profiles?: AgentProfile[] }): AgentProfile[] => s.profiles ?? DEFAULT_PROFILES

// ---------- tareas tipo ----------
export const DEFAULT_TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'tt-bug',
    name: 'Bug',
    icon: '🐞',
    titlePrefix: 'Bug: ',
    description: 'Pasos para reproducir:\n1. \n\nResultado esperado:\n\nResultado actual:',
    priority: 'high',
    estimateMin: 120,
    tags: ['bug'],
    subtasks: ['Reproducir el problema', 'Encontrar la causa', 'Corregir', 'Agregar una prueba que lo cubra', 'Probar y abrir el PR']
  },
  {
    id: 'tt-feature',
    name: 'Funcionalidad',
    icon: '✨',
    titlePrefix: '',
    description: 'Qué debe poder hacer el usuario:\n\nCriterios de aceptación:\n- ',
    priority: 'med',
    estimateMin: 240,
    tags: ['feature'],
    subtasks: ['Definir el alcance y los criterios', 'Implementar', 'Pruebas', 'Documentar', 'Abrir el PR']
  },
  {
    id: 'tt-hotfix',
    name: 'Hotfix',
    icon: '🚑',
    titlePrefix: 'Hotfix: ',
    description: 'Impacto:\n\nCausa probable:',
    priority: 'high',
    estimateMin: 60,
    tags: ['hotfix'],
    subtasks: ['Aislar la causa', 'Corregir lo mínimo', 'Probar', 'PR urgente y avisar a quien revisa']
  },
  {
    id: 'tt-refactor',
    name: 'Refactor',
    icon: '🧹',
    titlePrefix: 'Refactor: ',
    description: 'Qué se mejora y por qué:\n\nSin cambios de comportamiento.',
    priority: 'low',
    estimateMin: 180,
    tags: ['refactor'],
    subtasks: ['Asegurar que hay pruebas que cubren la zona', 'Refactorizar en pasos pequeños', 'Comprobar que las pruebas siguen pasando', 'Abrir el PR']
  }
]
export const taskTemplatesOf = (s: { taskTemplates?: TaskTemplate[] }): TaskTemplate[] => s.taskTemplates ?? DEFAULT_TASK_TEMPLATES

// ---------- disposiciones de la ventana ----------
export const DEFAULT_LAYOUTS: LayoutPreset[] = [
  { id: 'l-planificacion', name: 'Planificación', sideOpen: true, sideTab: 'session', sideW: 300, sidebarW: 220, dockOpen: false, dockH: 280, focus: false },
  { id: 'l-codigo', name: 'Código', sideOpen: true, sideTab: 'files', sideW: 360, sidebarW: 220, dockOpen: true, dockH: 300, focus: false },
  { id: 'l-revision', name: 'Revisión', sideOpen: true, sideTab: 'files', sideW: 420, sidebarW: 220, dockOpen: false, dockH: 280, focus: false },
  { id: 'l-foco', name: 'Foco', sideOpen: false, sideTab: 'session', sideW: 300, sidebarW: 220, dockOpen: false, dockH: 280, focus: true }
]
export const layoutsOf = (s: { layouts?: LayoutPreset[] }): LayoutPreset[] => s.layouts ?? DEFAULT_LAYOUTS
