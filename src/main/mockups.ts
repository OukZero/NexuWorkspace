// Mockups HTML de la pestaña Diseño: Claude los escribe en <userData>/mockups/<tarea>/ y la app los muestra en un iframe aislado.
import { app, BrowserWindow, dialog, protocol, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import type { MockupFile } from '../shared/types'
import { getMain } from './windows'

export const SCHEME = 'shutoki-mockup'

// Sin red ni acceso a nada fuera del propio documento: el HTML generado se trata como no confiable.
const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data:"

const NAME_RE = /^[\w][\w .()-]*\.html?$/i
const idOk = (id: string): boolean => /^[\w-]+$/.test(id)

export const mockupsRoot = (): string => path.join(app.getPath('userData'), 'mockups')
export const mockupsDir = (taskId: string): string => path.join(mockupsRoot(), idOk(taskId) ? taskId : '_')

/** Debe llamarse antes de que la app esté lista. */
export function registerMockupScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true } }])
}

/** shutoki-mockup://m/<tarea>/<archivo>: sirve el HTML con una CSP que bloquea toda la red. */
export function registerMockupProtocol(): void {
  protocol.handle(SCHEME, (req) => {
    const parts = new URL(req.url).pathname.split('/').filter(Boolean).map(decodeURIComponent)
    const [taskId, name] = parts
    if (parts.length !== 2 || !idOk(taskId) || !NAME_RE.test(name)) return new Response('No encontrado', { status: 404 })
    const file = path.join(mockupsDir(taskId), name)
    if (!fs.existsSync(file)) return new Response('No encontrado', { status: 404 })
    return new Response(fs.readFileSync(file), { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP, 'cache-control': 'no-store' } })
  })
}

export function listMockups(taskId: string): MockupFile[] {
  const dir = mockupsDir(taskId)
  try {
    return fs
      .readdirSync(dir)
      .filter((n) => NAME_RE.test(n))
      .map((name) => {
        const st = fs.statSync(path.join(dir, name))
        return { name, mtime: st.mtimeMs, size: st.size }
      })
      .sort((a, b) => b.mtime - a.mtime)
  } catch {
    return []
  }
}

export function deleteMockup(taskId: string, name: string): void {
  if (!NAME_RE.test(name)) throw new Error('Nombre no válido')
  fs.rmSync(path.join(mockupsDir(taskId), name), { force: true })
}

export function revealMockups(taskId: string): void {
  const dir = mockupsDir(taskId)
  fs.mkdirSync(dir, { recursive: true })
  void shell.openPath(dir)
}

/** Instrucciones de diseño para Claude (se pasan con --append-system-prompt-file). */
export function designInstructions(taskId: string, taskTitle: string): string {
  const dir = mockupsDir(taskId)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(mockupsRoot(), `instrucciones-${taskId}.txt`)
  fs.writeFileSync(
    file,
    [
      `Eres un diseñador de interfaces. La tarea es «${taskTitle}».`,
      `Cuando te pidan un mockup, diseño o pantalla, genéralo como UN solo archivo HTML autocontenido y guárdalo con la herramienta Write en esta carpeta: ${dir}`,
      '- Nombre en minúsculas con guiones y extensión .html (p. ej. login.html). Si es una variante o mejora de uno existente, guarda una versión nueva (login-v2.html) en vez de pisar el anterior.',
      '- CSS y JS en línea. Sin CDNs, fuentes ni imágenes externas: usa SVG en línea o data URIs. El visor bloquea la red.',
      '- Diseño responsive (se previsualiza en escritorio, tableta y móvil), con datos de ejemplo realistas en español, sin lorem ipsum.',
      '- Cuida jerarquía visual, espaciado, contraste y estados (hover, vacío, error) cuando aporten.',
      '- Puedes consultar el código del proyecto para respetar su estilo, pero NO modifiques el proyecto: solo escribe en la carpeta de mockups.',
      'Al terminar responde en dos líneas como máximo: qué incluye el mockup y el nombre del archivo.'
    ].join('\n')
  )
  return file
}

/** Exporta un mockup a PNG (captura completa) o PDF abriéndolo en una ventana oculta. */
export async function exportMockup(taskId: string, name: string, format: 'png' | 'pdf', width: number): Promise<string | null> {
  if (!NAME_RE.test(name) || !fs.existsSync(path.join(mockupsDir(taskId), name))) throw new Error('El mockup no existe')
  const w = Math.min(2400, Math.max(320, Math.round(width) || 1280))
  const win = new BrowserWindow({ show: false, width: w, height: 900, webPreferences: { sandbox: true, contextIsolation: true } })
  try {
    await win.loadURL(`${SCHEME}://m/${encodeURIComponent(taskId)}/${encodeURIComponent(name)}`)
    await new Promise((r) => setTimeout(r, 400)) // deja que terminen estilos y scripts en línea
    const base = path.basename(name, path.extname(name))
    const opts = { defaultPath: `${base}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] }
    const main = getMain()
    const res = main ? await dialog.showSaveDialog(main, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return null
    if (format === 'pdf') {
      fs.writeFileSync(res.filePath, await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' }))
    } else {
      const h = Number(await win.webContents.executeJavaScript('document.documentElement.scrollHeight')) || 900
      win.setContentSize(w, Math.min(8000, Math.max(300, h)))
      await new Promise((r) => setTimeout(r, 250))
      fs.writeFileSync(res.filePath, (await win.webContents.capturePage()).toPNG())
    }
    shell.showItemInFolder(res.filePath)
    return res.filePath
  } finally {
    win.destroy()
  }
}
