import { getAppearance } from './theme'

/** Sonidos sintetizados con WebAudio (sin archivos): breves y suaves; respetan el interruptor y el volumen de Apariencia. */
export type Sfx = 'start' | 'stop' | 'done' | 'pop' | 'blip'
let ctx: AudioContext | null = null

const NOTES: Record<Sfx, Array<[number, number]>> = {
  start: [[523, 0], [784, 0.09]],
  stop: [[659, 0], [440, 0.1]],
  done: [[523, 0], [659, 0.08], [784, 0.16], [1047, 0.24]],
  pop: [[880, 0]],
  blip: [[600, 0]] // se reemplaza por tonos al azar (voz del acompañante)
}

export function playSfx(kind: Sfx): void {
  const A = getAppearance()
  if (!A.sounds || A.soundVol <= 0) return
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const t0 = ctx.currentTime
    const vol = (A.soundVol / 100) * 0.12
    // «blip»: 2–3 piar breves de altura variable, como un personaje que balbucea
    const notes: Array<[number, number]> = kind === 'blip'
      ? Array.from({ length: 2 + Math.floor(Math.random() * 2) }, (_, i) => [520 + Math.random() * 520, i * 0.07] as [number, number])
      : NOTES[kind]
    for (const [f, d] of notes) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f
      g.gain.setValueAtTime(0, t0 + d)
      g.gain.linearRampToValueAtTime(vol, t0 + d + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.22)
      o.connect(g).connect(ctx.destination)
      o.start(t0 + d)
      o.stop(t0 + d + 0.25)
    }
  } catch {
    /* sin audio disponible: se omite */
  }
}
