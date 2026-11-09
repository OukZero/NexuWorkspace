import { nativeImage, type NativeImage } from 'electron'

/**
 * Icono con un punto rojo (borde blanco) en la esquina inferior derecha: indica mensajes sin leer.
 * Sin imagen base (p. ej. el icono de superposición de la barra de tareas) se dibuja solo el punto.
 */
export function withDot(base: NativeImage | null, size = 32): NativeImage {
  const pixels =
    base && !base.isEmpty() ? Buffer.from(base.resize({ width: size, height: size }).toBitmap()) : Buffer.alloc(size * size * 4)
  const r = Math.round(size * 0.22)
  const cx = size - r - 1
  const cy = cx
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy)
      if (d > r + 2) continue
      const i = (y * size + x) * 4
      const inner = d <= r
      // formato BGRA: el rojo del punto es (229, 62, 62)
      pixels[i] = inner ? 0x3e : 0xff
      pixels[i + 1] = inner ? 0x3e : 0xff
      pixels[i + 2] = inner ? 0xe5 : 0xff
      pixels[i + 3] = 0xff
    }
  }
  return nativeImage.createFromBitmap(pixels, { width: size, height: size })
}
