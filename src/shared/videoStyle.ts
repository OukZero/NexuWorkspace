/** Prompt por defecto (editable en la ventana de Videos) que enseña a Claude cómo escribir la narración. */
export const DEFAULT_VIDEO_STYLE = [
  'Narra como un compañero que enseña la pantalla a otra persona: cercano, claro y profesional, en español neutro y en segunda persona («ahora haz clic en…», «fíjate cómo…»).',
  'Cada narración es una sola frase corta (máx. 25 palabras) que dice QUÉ se hace y PARA QUÉ sirve, no cómo se llama el selector.',
  'Empieza con una introducción que diga qué se va a aprender y termina con un cierre que resuma lo logrado.',
  'Anticipa la acción antes de hacerla (la voz va justo antes del clic) y comenta el resultado cuando cambie la pantalla.',
  'Al rellenar formularios nombra el campo y di qué se escribe en él; no leas contraseñas ni datos sensibles.',
  'Evita muletillas, tecnicismos, anglicismos innecesarios y frases de relleno como «como podemos ver».',
  'Los datos de ejemplo deben ser realistas e inocuos (nombres, correos y teléfonos ficticios).'
].join('\n')
