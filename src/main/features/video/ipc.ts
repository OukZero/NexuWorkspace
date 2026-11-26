import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { app, net, protocol, shell } from 'electron'
import { pathToFileURL } from 'url'
import { api } from '../../api'
import { broadcast, getDb } from '../../db'
import { notify } from '../../notify'
import { askClaude } from '../ai/summary'
import type { VideoLogin, VideoProject, VideoStep } from '../../../shared/types'
import { DEFAULT_VIDEO_STYLE } from '../../../shared/videoStyle'
import { doLogin, launchBrowser, readControls, recordVideo, renderSession } from './record'

const ID = /^[a-f0-9]{8}$/
const FILE = /^video\.mp4$/
export const VIDEO_SCHEME = 'shutoki-video'
const MODELS = ['haiku', 'sonnet', 'opus']
const ACTIONS = ['goto', 'click', 'fill', 'press', 'scroll', 'wait']

const root = (): string => path.join(app.getPath('userData'), 'videos')
const dirOf = (id: string): string => path.join(root(), id)

/** Debe llamarse antes de que la app esté lista. `stream` permite avanzar y retroceder en el reproductor. */
export function registerVideoScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: VIDEO_SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }])
}

/** shutoki-video://v/<id>/video.mp4: solo sirve los MP4 generados, nada más del disco. */
export function registerVideoProtocol(): void {
  protocol.handle(VIDEO_SCHEME, (req) => {
    const parts = new URL(req.url).pathname.split('/').filter(Boolean).map(decodeURIComponent)
    const [id, name] = parts
    if (parts.length !== 2 || !ID.test(id) || !FILE.test(name)) return new Response('No encontrado', { status: 404 })
    const file = path.join(dirOf(id), name)
    if (!fs.existsSync(file)) return new Response('No encontrado', { status: 404 })
    return net.fetch(pathToFileURL(file).toString(), { headers: req.headers, bypassCustomProtocolHandlers: true })
  })
}

function readProject(id: string): VideoProject | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dirOf(id), 'project.json'), 'utf8')) as VideoProject
  } catch {
    return null
  }
}

function writeProject(p: VideoProject): void {
  fs.mkdirSync(dirOf(p.id), { recursive: true })
  fs.writeFileSync(path.join(dirOf(p.id), 'project.json'), JSON.stringify(p, null, 2))
}

/** Acepta solo http(s): el guion lo escribe una IA y no debe poder abrir file:// ni otros esquemas. */
function checkUrl(u: string): string {
  let url: URL
  try {
    url = new URL(u.trim())
  } catch {
    throw new Error('La URL no es válida (ej.: http://localhost:5173).')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Solo se admiten direcciones http o https.')
  return url.toString()
}

/** Limpia lo que devuelve Claude: acciones conocidas, textos acotados y ninguna URL fuera de http(s). */
function cleanSteps(raw: unknown, url: string, lenient = false): VideoStep[] {
  if (!Array.isArray(raw)) return []
  const steps = raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .filter((s) => ACTIONS.includes(String(s.action)))
    .slice(0, 60)
    .map((s): VideoStep => {
      const item = Number(s.item)
      return { action: s.action as VideoStep['action'], target: s.target != null ? String(s.target).slice(0, 300) : undefined, value: s.value != null ? String(s.value).slice(0, 200) : undefined, say: String(s.say ?? '').slice(0, 300), ...(Number.isInteger(item) && item >= 0 && item < 100 ? { item } : {}), ...(s.zoom === 'off' || s.zoom === 'in' ? { zoom: s.zoom } : {}) }
    })
  // al guardar mientras se edita se tolera una URL a medias; al grabar o generar se exige válida
  for (const s of steps) if (s.action === 'goto') s.target = lenient ? (s.target || url) : checkUrl(s.target || url)
  return steps
}

/** Convierte el paso a paso del autor en instrucciones numeradas (quita viñetas y numeración propia). */
function parseItems(notes: string): string[] {
  return notes
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\d+\s*[.)\-:]|[-*•])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 40)
}

let current: AbortController | null = null

async function withRun<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (current) throw new Error('Ya hay un video en curso: espera a que termine o cancélalo.')
  const ctl = new AbortController()
  current = ctl
  try {
    return await fn(ctl.signal)
  } finally {
    current = null
  }
}

export function registerVideoIpc(): void {
  api('video:script', (input) =>
    withRun(async (signal) => {
      const url = checkUrl(input.url)
      const goal = input.goal.trim()
      if (!goal) throw new Error('Describe la funcionalidad que quieres mostrar.')
      const model = MODELS.includes(input.model ?? '') ? (input.model as string) : 'sonnet'
      const notes = (input.notes ?? '').trim().slice(0, 3000)
      const items = parseItems(notes)
      const style = (input.style ?? '').trim().slice(0, 3000) || DEFAULT_VIDEO_STYLE
      const prev = input.id ? readProject(input.id) : null
      if (input.id && (!ID.test(input.id) || !prev)) throw new Error('Proyecto no encontrado.')
      const say = (text: string): void => broadcast('video:progress', { id: 'new', text })
      say('Abriendo la app…')
      const browser = await launchBrowser()
      const onAbort = (): void => void browser.close().catch(() => undefined)
      signal.addEventListener('abort', onAbort)
      let controls = ''
      try {
        const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
        if (input.login && !input.login.showLogin) await doLogin(page, url, input.login)
        else await page.goto(input.login?.loginUrl || url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined)
        controls = await readControls(page)
      } finally {
        signal.removeEventListener('abort', onAbort)
        await browser.close().catch(() => undefined)
      }
      say(`Escribiendo el guion con Claude (${model})…`)
      // la contraseña nunca llega al prompt: solo se describe el estado de la sesión
      const sessionNote = !input.login ? 'se graba sin iniciar sesión.' : input.login.showLogin ? 'se graba SIN sesión: incluye los pasos de login (clic en iniciar sesión, usuario, contraseña, enviar).' : 'la sesión ya está iniciada al empezar; NO incluyas pasos de login.'
      const prompt = `Eres guionista de videos tutoriales de aplicaciones web. Crea el guion para mostrar esta funcionalidad: "${goal}".\n\n\nEstilo de la narración (aplícalo a todos los "say"):\n${style}\n${items.length ? `\nPASO A PASO DEL AUTOR (${items.length} instrucciones, obligatorias, en este orden):\n${items.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n` : ''}\nEstado de la grabación: ${sessionNote}\nEsto es lo que se ve en la primera pantalla:\n${controls}\n\nReglas:\n- Cubre TODO lo que pide el autor, en el orden en que lo describe, sin resumir ni omitir pasos: cada acción mencionada (entrar a una sección, hacer clic, rellenar cada campo, enviar, comprobar el resultado) es al menos un paso. Usa tantos pasos como haga falta (hasta 60).${items.length ? '\n- CADA instrucción numerada del autor debe tener al menos un paso con "item": N (su número), en el mismo orden; una instrucción con varias acciones (ej. rellenar un formulario con 5 campos) genera un paso por acción, todos con el mismo "item". NO omitas ninguna, NO cambies su orden y NO añadas acciones que el autor no pidió: solo se permiten el paso inicial y el de cierre (item 0) y esperas (wait) entre pasos.' : ''}\n- Solo ves la primera pantalla. Para controles de pantallas posteriores deduce un selector razonable (text="Texto visible" para botones y enlaces, input[type="password"], input[name="email"]…) y añade un paso wait de 1500 a 3000 ms tras cada acción que cambie de pantalla.\n- Cuando el autor diga «botón X» usa el selector role=button[name="X"] (NUNCA text="X", que puede coincidir con un título); para «enlace X» role=link[name="X"]; para un campo por su etiqueta usa role=textbox[name="Etiqueta"] o el input/placeholder de la lista. Si el autor dice qué textos ignorar (títulos, descripciones), respétalo.\n- Para escribir credenciales usa SIEMPRE los marcadores {{usuario}} y {{contraseña}} en "value"; nunca inventes datos de acceso.\n- Responde SOLO con un array JSON, sin texto extra: [{"action":"goto|click|fill|press|scroll|wait","target":"…","value":"…","say":"…","item":0}]\n- El primer paso es {"action":"goto","target":"${url}"} con una frase de introducción.\n- click/fill: en la primera pantalla "target" debe ser EXACTAMENTE uno de los selectores de la lista. fill usa "value" con datos de ejemplo inocuos (nunca contraseñas reales). press usa "value" (ej. Enter). scroll usa "target" en píxeles. wait usa "target" en milisegundos.\n- "say" es la narración en español, en una frase corta (máx. 25 palabras), natural, sin mencionar selectores.\n- El último paso cierra con un resumen.\n- En la primera pantalla no inventes controles que no aparezcan en la lista.`
      const ask = async (pr: string): Promise<VideoStep[]> => {
        const out = await askClaude(pr, getDb().settings.claudeCmd, 240000, model, undefined, undefined, { signal })
        const m = out.match(/\[[\s\S]*\]/)
        try {
          return m ? cleanSteps(JSON.parse(m[0]), url) : []
        } catch {
          return []
        }
      }
      const missingOf = (st: VideoStep[]): number[] => items.map((_, i) => i + 1).filter((n) => !st.some((s) => s.item === n))
      let steps = await ask(prompt)
      // el paso a paso del autor es obligatorio: si falta alguna instrucción se reintenta una vez diciéndole cuáles
      let missing = items.length ? missingOf(steps) : []
      if (steps.length && missing.length) {
        say(`Faltan ${missing.length} instrucciones del paso a paso; corrigiendo…`)
        const fix = `${prompt}\n\nTu respuesta anterior fue:\n${JSON.stringify(steps)}\n\nOmitió estas instrucciones del autor: ${missing.map((n) => `${n}. ${items[n - 1]}`).join(' | ')}.\nDevuelve el guion COMPLETO de nuevo (todo el array), incluyendo pasos con "item" para cada una de ellas en su posición correcta.`
        const again = await ask(fix)
        if (again.length) {
          steps = again
          missing = missingOf(steps)
        }
      }
      if (!steps.length) throw new Error('Claude no devolvió un guion válido. Inténtalo de nuevo con una descripción más concreta.')
      if (missing.length) throw new Error(`Claude omitió ${missing.length === 1 ? 'esta instrucción' : 'estas instrucciones'} del paso a paso: ${missing.map((n) => `«${items[n - 1]}»`).join(', ')}. Vuelve a generar (prueba con Sonnet u Opus) o divide la instrucción en pasos más simples.`)
      const brief = { notes, model, style, useLogin: !!input.login, showLogin: !!input.login?.showLogin, loginUrl: input.login?.loginUrl?.trim() || undefined }
      const p: VideoProject = prev ? { ...prev, url, goal, steps, ...brief } : { id: randomUUID().slice(0, 8), title: goal.slice(0, 80), url, goal, steps, createdAt: Date.now(), file: '', ...brief }
      writeProject(p)
      return p
    })
  )

  api('video:record', (project, login?: VideoLogin) =>
    withRun(async (signal) => {
      const p = readProject(project.id) ?? project
      if (!ID.test(p.id)) throw new Error('Proyecto no válido.')
      const url = checkUrl(project.url)
      const steps = cleanSteps(project.steps, url)
      if (!steps.length) throw new Error('El guion no tiene pasos.')
      const progress = (text: string): void => broadcast('video:progress', { id: p.id, text })
      // vista en vivo: el renderer recibe un fotograma como máximo cada ~250 ms
      const onFrame = (frame: string): void => broadcast('video:progress', { id: p.id, text: '', frame })
      const file = await recordVideo({ steps, url, login, dir: dirOf(p.id), signal, progress, onFrame, voice: project.voice ?? p.voice })
      const done: VideoProject = { ...p, title: project.title || p.title, url, steps, file: path.basename(file), session: true, rev: Date.now() }
      writeProject(done)
      notify({ kind: 'done', title: 'Video listo', body: done.title, goto: 'videos', tg: false })
      return done
    })
  )

  // reajusta el zoom sobre la grabación guardada: segundos en vez de volver a recorrer la app y regenerar la voz
  api('video:remux', (project) =>
    withRun(async (signal) => {
      const p = readProject(project.id)
      if (!p || !ID.test(p.id)) throw new Error('Proyecto no encontrado.')
      const steps = cleanSteps(project.steps, p.url, true)
      const progress = (text: string): void => broadcast('video:progress', { id: p.id, text })
      const file = await renderSession(dirOf(p.id), steps, signal, progress)
      const done: VideoProject = { ...p, title: project.title || p.title, steps, file: path.basename(file), rev: Date.now() }
      writeProject(done)
      return done
    })
  )

  api('video:list', () => {
    if (!fs.existsSync(root())) return []
    return fs
      .readdirSync(root())
      .filter((id) => ID.test(id))
      .map(readProject)
      .filter((p): p is VideoProject => !!p)
      .sort((a, b) => b.createdAt - a.createdAt)
  })

  api('video:save', (p) => {
    if (!ID.test(p.id) || !readProject(p.id)) throw new Error('Proyecto no encontrado.')
    // autoguardado mientras se escribe: nada de validar de más (la URL se exige al grabar)
    const old = readProject(p.id)
    const saved: VideoProject = { ...p, createdAt: old?.createdAt ?? p.createdAt, file: old?.file ?? p.file, session: old?.session, rev: old?.rev, steps: cleanSteps(p.steps, p.url, true) }
    writeProject(saved)
    return saved
  })

  api('video:delete', (id) => {
    if (!ID.test(id)) throw new Error('Proyecto no válido.')
    fs.rmSync(dirOf(id), { recursive: true, force: true })
  })

  api('video:reveal', (id) => {
    const p = readProject(id)
    if (!p?.file) throw new Error('Este proyecto aún no tiene video.')
    shell.showItemInFolder(path.join(dirOf(id), p.file))
  })

  api('video:cancel', () => current?.abort())
}
