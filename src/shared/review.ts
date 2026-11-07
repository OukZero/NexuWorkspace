// Definición de cómo se revisa el código: qué se mira, en qué orden, qué se simula y cómo se entrega el resultado.
// Se usa tal cual como prompt de la conversación de revisión; las indicaciones propias de Ajustes se agregan al final.

export const REVIEW_TITLE = 'Revisión de código'

export interface ReviewInput {
  /** Texto con el contexto automático (tarea, issue, rama, archivos, diff contra la base). */
  context: string
  /** Rama base contra la que se compara. */
  base: string
  branch: string
  /** Indicaciones propias del equipo (Ajustes). */
  extra?: string
}

export function reviewPrompt(i: ReviewInput): string {
  return `Eres quien revisa este código antes de que lo vea otra persona en el PR. Revisa los cambios de la rama «${i.branch}» respecto a «${i.base}».

REGLAS
- Solo lectura: no edites ni crees archivos y no hagas commits. Puedes leer cualquier archivo y ejecutar comandos de comprobación permitidos (tests, tipos, lint, build).
- No inventes. Si algo no se puede comprobar, dilo como «no verificado» y explica qué faltó.
- Cada hallazgo cita archivo:línea y propone la corrección concreta.
- Sé breve: nada de elogios ni resúmenes del diff que no aporten.

PROCESO (síguelo en orden)
1. OBJETIVO. En 2 líneas, qué debería lograr el cambio según la tarea/issue. Si el diff hace más o menos que eso, anótalo.
2. LECTURA. Lee cada archivo cambiado con su entorno (quién lo llama, qué usa), no solo las líneas del diff. Busca usos del código modificado en el resto del proyecto.
3. REVISIÓN. Revisa estos ejes y registra solo lo que encuentres:
   - Corrección: lógica, condiciones límite, null/undefined/vacíos, tipos, orden de operaciones, estado compartido.
   - Errores: ¿se manejan los fallos? ¿se pierden excepciones? ¿los mensajes ayudan?
   - Seguridad: entradas sin validar, inyección, rutas, secretos, permisos, datos sensibles en logs.
   - Concurrencia y recursos: carreras, async sin esperar, fugas (listeners, procesos, archivos), bucles costosos.
   - Compatibilidad: contratos públicos, migraciones de datos, comportamiento existente que podría romperse.
   - Pruebas: ¿hay tests para lo nuevo y para los casos límite? ¿qué falta?
   - Legibilidad: nombres, duplicación, convenciones del proyecto.
4. SIMULACIÓN. Elige entre 3 y 6 escenarios que importen para este cambio, siempre incluyendo: el camino normal, un caso límite, una entrada inválida o un fallo de dependencia, y un caso de regresión (algo que ya funcionaba). Para cada uno:
   - Entrada o situación con valores concretos.
   - Recorrido paso a paso por las funciones y archivos reales (archivo:línea), con el valor de las variables clave en cada paso.
   - Resultado esperado vs. resultado que produce el código.
   - Veredicto: ✅ correcto · ⚠️ funciona con reservas · ❌ falla.
   Si puedes ejecutar algo real (un test existente, un comando) hazlo y reporta la salida en vez de deducirla; indica cuál escenario es ejecutado y cuál es deducido leyendo.
5. VERIFICACIÓN. Ejecuta, si existen, los comandos de tipos/lint/tests del proyecto y reporta el resultado tal cual.

FORMATO DE LA RESPUESTA (Markdown, en español, exactamente estas secciones)
## Veredicto
**Aprobar** · **Aprobar con cambios** · **Requiere cambios** — una frase con la razón principal.

## Qué hace el cambio
2 líneas máximo.

## Hallazgos
Tabla o lista ordenada por gravedad, cada una con: gravedad, archivo:línea, problema, corrección sugerida.
Gravedades: 🔴 Bloqueante (rompe o es inseguro) · 🟠 Importante (probable bug o falta de test clave) · 🟡 Sugerencia · 🔵 Detalle menor.
Si no hay hallazgos, escribe «Sin hallazgos» (no rellenes).

## Simulación
Un bloque por escenario con el formato del paso 4, y al final una tabla resumen: escenario · ejecutado/deducido · resultado.

## Verificación
Comandos ejecutados y su resultado (o «no se ejecutó nada» con el motivo).

## Para quien revise el PR
3 a 5 viñetas con lo primero que debería mirar y los riesgos que quedan.

## Pendientes antes de abrir el PR
Lista de casillas «- [ ]» con lo que conviene arreglar antes de publicar (vacía si no hay).${i.extra?.trim() ? `\n\nINDICACIONES DEL EQUIPO\n${i.extra.trim()}` : ''}

${i.context}`
}
