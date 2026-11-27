/** Foco que sigue al cursor sobre las tarjetas (.bc): un solo listener delegado, sin estado de React. */
export function initFx(): void {
  let raf = 0
  document.addEventListener(
    'pointermove',
    (e) => {
      const el = (e.target as HTMLElement | null)?.closest?.('.bc') as HTMLElement | null
      if (!el || raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const r = el.getBoundingClientRect()
        el.style.setProperty('--mx', `${e.clientX - r.left}px`)
        el.style.setProperty('--my', `${e.clientY - r.top}px`)
      })
    },
    { passive: true }
  )
}
