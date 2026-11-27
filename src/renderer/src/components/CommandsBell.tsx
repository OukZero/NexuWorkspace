import * as Popover from '@radix-ui/react-popover'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { G } from './glyphs'

interface Cmd { keys: string; label: string; hint?: string }
interface Group { title: string; items: Cmd[] }

// Catálogo de lo que se puede hacer; mantenerlo al día cuando cambien los atajos de App.tsx / Sidebar.tsx
const GROUPS: Group[] = [
  {
    title: 'Atajos de teclado',
    items: [
      { keys: 'Ctrl+K', label: 'Búsqueda global', hint: 'Vistas, acciones, tareas, conversaciones y notas' },
      { keys: 'Ctrl+J', label: 'Asistente', hint: 'Pídele algo con texto' },
      { keys: 'Ctrl+/', label: 'Ayuda de atajos' },
      { keys: 'Ctrl+Mayús+F', label: 'Modo foco', hint: 'Oculta menú, pestañas y barra de estado' },
      { keys: 'F11', label: 'Pantalla completa' },
      { keys: 'Ctrl+Alt+T', label: 'Iniciar / pausar / reanudar el timer', hint: 'De la tarea abierta si no hay ninguno en marcha' },
      { keys: 'Ctrl+AvPág / RePág', label: 'Pestaña de tarea siguiente / anterior' },
      { keys: 'Ctrl+`', label: 'Mostrar u ocultar la terminal', hint: 'De la tarea activa' },
      { keys: 'Ctrl+B', label: 'Mostrar u ocultar el menú lateral' },
      { keys: 'Esc', label: 'Cerrar el diálogo abierto' }
    ]
  },
  {
    title: 'Comandos del chat',
    items: [
      { keys: '/compact', label: 'Compactar la conversación', hint: 'Resume el historial para ahorrar contexto' },
      { keys: '/context', label: 'Ver el uso de contexto' }
    ]
  },
  {
    title: 'Desde la búsqueda global (Ctrl+K)',
    items: [
      { keys: 'Acción', label: 'Nueva tarea, nueva nota, nueva conversación' },
      { keys: 'Acción', label: 'Abrir terminal, VS Code o lanzar el entorno de la tarea' },
      { keys: 'Acción', label: 'Alternar tema día / noche, probar un tema al azar' },
      { keys: 'Acción', label: 'Personalizar apariencia, catálogo de skills' },
      { keys: 'Acción', label: 'Abrir WhatsApp, exportar datos (.json)' }
    ]
  },
  {
    title: 'Telegram',
    items: [
      { keys: '/tareas', label: 'Elegir la tarea con la que hablar' },
      { keys: '/actual', label: 'Ver la tarea elegida' },
      { keys: '/cancelar', label: 'Detener la respuesta en curso' },
      { keys: '/ayuda', label: 'Mostrar esta ayuda en Telegram' },
      { keys: 'Responder', label: 'Responder a un aviso envía tu mensaje a esa conversación' }
    ]
  },
  {
    title: 'Ventana flotante y barra del borde',
    items: [
      { keys: 'Minimizar', label: 'Con “Al minimizar” en barra, aparece una barra en el borde derecho' },
      { keys: 'Mouse', label: 'Pasa el mouse por la barra para abrir Chat IA o volver a la app' },
      { keys: 'Chat IA', label: 'Escribe, pega o suelta imágenes y documentos; el borrador se conserva' },
      { keys: 'Acompañante', label: 'Arrástralo con el mouse; haz clic para que hable' }
    ]
  }
]

/** Botón con el listado de comandos y funciones (como la campanita, pero de comandos); buscable. */
export function CommandsBell({ variant = 'top' }: { variant?: 'rail' | 'top' }): ReactNode {
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return GROUPS
    return GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((i) => words.every((w) => `${i.keys} ${i.label} ${i.hint ?? ''} ${g.title}`.toLowerCase().includes(w)))
    })).filter((g) => g.items.length)
  }, [q])

  return (
    <Popover.Root onOpenChange={(o) => !o && setQ('')}>
      <Popover.Trigger asChild>
        <button className={variant === 'top' ? 'ib' : 'rb'} title="Comandos y funciones" data-tip="Comandos y funciones" aria-label="Comandos y funciones">
          <G n="terminal" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="notif-pop cmd-pop" side={variant === 'top' ? 'bottom' : 'right'} align="end" sideOffset={10} collisionPadding={12}>
          <div className="notif-head">
            <b>Comandos y funciones</b>
          </div>
          <div className="cmd-search">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar comando o función…" aria-label="Buscar comando" />
          </div>
          <div className="notif-list">
            {shown.length ? (
              shown.map((g) => (
                <section key={g.title} className="cmd-group">
                  <h4>{g.title}</h4>
                  {g.items.map((i, k) => (
                    <div key={i.keys + k} className="cmd-item">
                      <kbd>{i.keys}</kbd>
                      <span className="cmd-txt">
                        <b>{i.label}</b>
                        {i.hint && <small>{i.hint}</small>}
                      </span>
                    </div>
                  ))}
                </section>
              ))
            ) : (
              <div className="notif-empty">Nada coincide con «{q}».</div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
