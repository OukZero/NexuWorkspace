import { useEffect, useState } from 'react'

/** true mientras el usuario escribe en cualquier campo de texto (y ~1,2 s después de la última tecla). Solo escucha; no guarda nada. */
export function useTyping(hold = 1200): boolean {
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    let off = 0
    const down = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey || ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape'].includes(e.key)) return
      const t = e.target as HTMLElement | null
      if (!t || !(t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return
      if (t instanceof HTMLInputElement && ['checkbox', 'radio', 'range', 'color', 'button'].includes(t.type)) return
      setTyping(true)
      window.clearTimeout(off)
      off = window.setTimeout(() => setTyping(false), hold)
    }
    window.addEventListener('keydown', down, true)
    return () => { window.removeEventListener('keydown', down, true); window.clearTimeout(off) }
  }, [hold])
  return typing
}
