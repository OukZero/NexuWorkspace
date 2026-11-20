// Adjuntos del chat: se copian a <userData>/adjuntos/<conversación>/ para que sigan disponibles aunque el original cambie.
import fs from 'fs'
import path from 'path'
import { app, dialog } from 'electron'
import type { Attachment } from '../../../shared/types'
import { getMain } from '../../windows'

export const MAX_BYTES = 20 * 1024 * 1024
const IMAGE_MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }

export const attachRoot = (): string => path.join(app.getPath('userData'), 'adjuntos')
const dirOf = (convId: string): string => path.join(attachRoot(), convId.replace(/[^\w-]/g, '_'))

const safeName = (n: string): string => (path.basename(n).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'archivo').slice(0, 120)

function unique(dir: string, name: string): string {
  const ext = path.extname(name)
  const base = path.basename(name, ext)
  let p = path.join(dir, name)
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${base} (${i})${ext}`)
  return p
}

const describeFile = (p: string, size: number): Attachment => {
  const mime = IMAGE_MIME[path.extname(p).toLowerCase()] ?? ''
  return { name: path.basename(p), path: p, image: !!mime, mime: mime || 'application/octet-stream', size }
}

export function saveBytes(convId: string, name: string, data: Uint8Array): Attachment {
  if (data.byteLength > MAX_BYTES) throw new Error(`«${name}» supera ${MAX_BYTES / 1024 / 1024} MB.`)
  const dir = dirOf(convId)
  fs.mkdirSync(dir, { recursive: true })
  const p = unique(dir, safeName(name))
  fs.writeFileSync(p, data)
  return describeFile(p, data.byteLength)
}

export async function pick(convId: string): Promise<Attachment[]> {
  const main = getMain()
  const opts = { properties: ['openFile' as const, 'multiSelections' as const] }
  const r = main ? await dialog.showOpenDialog(main, opts) : await dialog.showOpenDialog(opts)
  if (r.canceled) return []
  const dir = dirOf(convId)
  fs.mkdirSync(dir, { recursive: true })
  return r.filePaths.map((src) => {
    const size = fs.statSync(src).size
    if (size > MAX_BYTES) throw new Error(`«${path.basename(src)}» supera ${MAX_BYTES / 1024 / 1024} MB.`)
    const dest = unique(dir, safeName(src))
    fs.copyFileSync(src, dest)
    return describeFile(dest, size)
  })
}

/** Solo sirve archivos de la carpeta de adjuntos (el renderer no puede pedir rutas arbitrarias). */
export function preview(p: string): string | null {
  const root = attachRoot() + path.sep
  const full = path.resolve(p)
  const mime = IMAGE_MIME[path.extname(full).toLowerCase()]
  if (!mime || !full.startsWith(root) || !fs.existsSync(full)) return null
  return `data:${mime};base64,${fs.readFileSync(full).toString('base64')}`
}

/** Valida que el adjunto recibido del renderer sea un archivo de la carpeta de adjuntos. */
export function trusted(list: Attachment[] | undefined): Attachment[] {
  const root = attachRoot() + path.sep
  return (list ?? [])
    .map((a) => path.resolve(a.path))
    .filter((p) => p.startsWith(root) && fs.existsSync(p))
    .map((p) => describeFile(p, fs.statSync(p).size))
}
