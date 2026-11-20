/** Plantillas de estimación por defecto del agente estimador (el usuario puede reemplazarlas desde Equipo).
 *  Derivadas de las referencias «CUBICACIÓN …» (técnica) y «Documento explicativo …» (comercial). */
export type EstimateLevel = 'technical' | 'commercial'

export const ESTIMATE_LEVELS: Array<[EstimateLevel, string]> = [
  ['technical', 'Técnica'],
  ['commercial', 'Comercial']
]

export const DEFAULT_ESTIMATE_TEMPLATES: Record<EstimateLevel, string> = {
  technical: `PLANTILLA DE CUBICACIÓN TÉCNICA. Respeta este orden de secciones, escribe en español y usa tablas Markdown.
Usa comas decimales (3,5) y la unidad «jornada» = 1 persona × 8 h. No inventes datos: lo que no se sepa va como supuesto.

# CUBICACIÓN
**<Nombre de la iniciativa>** · Cliente: <cliente> · Escenarios: <A / B si aplica> · Fecha: <dd/mm/aaaa>
- Base: <sistemas/repositorios actuales sobre los que se estima>.
- Unidad: jornadas de trabajo (1 jornada = 1 persona × 8 h), indicando si es desarrollo asistido por IA.
- Nivel de información: <alto/medio/bajo> y qué falta; si es bajo, súbelo a la contingencia y dilo.

## 1. Resumen
Caso de uso en 2–4 líneas y, si hay escenarios, qué cubre cada uno (B incluye A).
Tabla resumen por fase: | Bloque | Esc. A | Esc. B | con subtotal desarrollo, gestión y coordinación (10 %), total base, contingencia (suele ser 15–20 %) y total con contingencia.
Diferencia entre escenarios, recomendación y duración estimada (semanas con N personas).
Opcionales fuera del total (remite a la sección 8).
Leyenda de estado: Integrado (ya existe, solo configuración) · Parcial (existe la base, se cubica la extensión) · Nuevo (se cubica completo).

## 2. Lo que ya está integrado
Tabla | Capacidad | Dónde está (módulo/clase) | Estado |, y una frase de lectura: qué existe y qué es realmente nuevo.

## 3. Modelo de decisión / reglas de negocio (solo si aplica)
Tabla | Regla | Condición | Si falla |, con umbrales entre [corchetes] que se cierran en el taller.

## 4. Detalle por fase
Para cada fase: «Fase N – nombre (A: x · B: y)» y tabla | # | Tarea | Estado | Esc. A (jornadas) | Esc. B (jornadas) | con subtotal de la fase.
Fases habituales: 0 Levantamiento y puesta en marcha · 1..n desarrollo por componente · Trazabilidad y control · Pruebas, piloto y salida (incluye seguridad, despliegue, documentación y capacitación).
Cada tarea es concreta (qué se construye y sobre qué componente) y cuesta de 0,5 a 3,0 jornadas.

## 5. Alertas específicas (país, normativa, datos)
Tabla | Tema | Alerta | Tratamiento |.

## 6. Posibles errores y casos límite
Tabla | Situación | Consecuencia | Mitigación |.

## 7. Dependencias y preguntas abiertas
## 8. Opcionales (fuera del total, con jornadas)
## 9. Riesgos
## 10. Supuestos explícitos
Lista numerada; las cifras dependen de ellos.

Comprueba que los subtotales por fase suman el subtotal de desarrollo y que gestión y contingencia están bien calculadas.
`,
  commercial: `PLANTILLA DE DOCUMENTO EXPLICATIVO (NIVEL COMERCIAL). Audiencia no técnica: lenguaje simple, sin siglas ni tecnicismos (si usas una, explícala).
Escribe en español, con párrafos cortos, listas y tablas Markdown. Usa comas decimales y «jornadas de trabajo» (1 jornada = 1 día de una persona).

# PROPUESTA DE MEJORA
**Cliente:** <cliente> · **Tema:** <qué mejora, en una línea> · **Alcance:** <módulo> · <mes y año>
Documento complementario a la cubicación de tareas.

## 1. Propósito de este documento
Qué explica y para quién, y que se entrega junto a la cubicación técnica.

## 2. Resumen ejecutivo
La pregunta o problema de negocio que hoy no se puede resolver, y qué se construirá para resolverlo (3–5 líneas).

## 3. Situación actual
Cómo funciona hoy el proceso, paso a paso (puedes numerar los pasos del flujo) y qué limitaciones tiene.
Viñetas con las reglas del negocio relevantes y por qué hoy hay que hacerlo a mano.

## 4. Qué queremos lograr
Resultado esperado. Si hay estados o resultados posibles, tabla | Estado | Qué significa |.

## 5. Cómo funcionará (en simple)
Pasos numerados del proceso, cada uno con una frase corta en negrita y su explicación.
Cierra aclarando si las personas cambian o no su forma de trabajar.

## 6. Beneficios
Viñetas orientadas a negocio (auditoría, ahorro de trabajo manual, datos verificables, reglas claras, sin cambios para los usuarios).

## 7. Alcance
Qué incluye esta etapa y, explícitamente, qué queda fuera (y que podría evaluarse por separado).

## 8. Trabajo a realizar
Tabla | Etapa | En qué consiste | con etapas típicas: 1 Análisis y diseño · 2 Datos · 3 Integración/consulta · 4 Reglas de cálculo · 5 Reporte o pantalla · 6 Pruebas integrales · 7 Puesta en marcha.

## 9. Estimación de esfuerzo
«El esfuerzo total estimado es de X jornadas de trabajo. Una jornada equivale a un día de trabajo de una persona.»
Tabla | Etapa | Jornadas estimadas | con fila TOTAL (debe coincidir con la cubicación técnica).
Nota: las jornadas son esfuerzo, no tiempo de calendario; la estimación es preliminar y puede ajustarse al confirmar lo pendiente.

## 10. Supuestos y consideraciones
Viñetas: qué se reutiliza, definiciones de términos, reglas con varios casos, dónde se entrega el dato, «Por confirmar», «Pendiente de definir (no incluido en la estimación)» y qué no incluye la estimación (gobierno de proyecto, esperas externas, accesos necesarios).
Si hay casos pendientes, tabla | Caso | Qué hay que definir |.

## 11. Documentos que acompañan esta propuesta
Este documento explicativo y la cubicación de tareas (detalle, perfiles y jornadas).
`
}

/** Nivel pedido en el mensaje: «comercial» / «técnica»; null si no se distingue. */
export function detectLevel(text: string): EstimateLevel | null {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const c = /comercial|explicativ|no tecnic/.test(t)
  const k = /tecnic|cubicacion/.test(t) && !/no tecnic/.test(t)
  return c === k ? null : c ? 'commercial' : 'technical'
}
