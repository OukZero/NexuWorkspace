import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { chromium, type Browser, type Locator, type Page } from 'playwright-core'
import ffmpegStatic from 'ffmpeg-static'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import type { VideoLogin, VideoStep } from '../../../shared/types'

const run = promisify(execFile)
const VIEWPORT = { width: 1280, height: 720 }
/** Tiempo máximo de cada acción de Playwright: si un selector no aparece, el paso falla con un mensaje claro. */
const ACTION_MS = 8000

/** Abre el Chrome o Edge ya instalado: así no hay que empaquetar ni descargar Chromium. */
export async function launchBrowser(): Promise<Browser> {
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel, headless: true })
    } catch {
      /* prueba el siguiente */
    }
  }
  throw new Error('No encontré Google Chrome ni Microsoft Edge instalados: se necesita uno de los dos para grabar.')
}

/** Rellena el formulario de entrada si la página pide contraseña (si no hay campo de contraseña, se asume que ya hay sesión). */
export async function doLogin(page: Page, url: string, login: VideoLogin): Promise<void> {
  await page.goto(login.loginUrl || url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  const pass = page.locator('input[type=password]:visible').first()
  try {
    await pass.waitFor({ state: 'visible', timeout: 6000 })
  } catch {
    return
  }
  const user = page.locator('input[type=email]:visible, input[autocomplete=username]:visible, input[name*=user i]:visible, input[name*=mail i]:visible, input[id*=user i]:visible, input[id*=mail i]:visible, input[type=text]:visible').first()
  if (await user.count()) await user.fill(login.user)
  await pass.fill(login.password)
  const submit = page.locator('button[type=submit]:visible, input[type=submit]:visible').first()
  if (await submit.count()) await submit.click()
  else await pass.press('Enter')
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined)
  if (await page.locator('input[type=password]:visible').count()) throw new Error('El login no funcionó: la página sigue pidiendo contraseña. Revisa usuario y contraseña.')
}

/** Resumen compacto de lo que se puede tocar en la página, para que Claude solo use selectores que existen. */
export async function readControls(page: Page): Promise<string> {
  const rows = await page.evaluate(() => {
    const out: string[] = []
    const seen = new Set<string>()
    const q = 'a[href],button,input,select,textarea,[role=button],[role=tab],[role=menuitem],[data-testid]'
    document.querySelectorAll<HTMLElement>(q).forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width < 4 || r.height < 4 || getComputedStyle(el).visibility === 'hidden') return
      const tag = el.tagName.toLowerCase()
      const text = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 50)
      const tid = el.getAttribute('data-testid')
      const id = el.id && !/\d{4,}/.test(el.id) ? el.id : ''
      const name = el.getAttribute('name')
      let sel = ''
      if (tid) sel = `[data-testid="${tid}"]`
      else if (id) sel = `#${CSS.escape(id)}`
      else if (name) sel = `${tag}[name="${name}"]`
      else if (text && (tag === 'button' || tag === 'a' || el.getAttribute('role'))) sel = `text="${text.replace(/"/g, '')}"`
      if (!sel || seen.has(sel)) return
      seen.add(sel)
      const type = el.getAttribute('type')
      out.push(`${tag}${type ? `[${type}]` : ''} | ${text || '—'} | ${sel}`)
    })
    return out.slice(0, 70)
  })
  const title = await page.title()
  const heads = await page.locator('h1,h2').allInnerTexts().catch(() => [] as string[])
  return `URL: ${page.url()}\nTítulo: ${title}\nEncabezados: ${heads.slice(0, 6).join(' / ')}\nControles (tipo | texto | selector):\n${rows.join('\n')}`
}

// ── Voz: SAPI de Windows (System.Speech), sin claves ni red ──────────────────────────────────────────────
const TTS_PS = `Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$v = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'es*' } | Select-Object -First 1
if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }
$s.SetOutputToWaveFile($env:NX_OUT)
$s.Speak($env:NX_TEXT)
$s.Dispose()`

/** Voces neuronales de Microsoft Edge (más naturales que SAPI; requieren internet). `sapi` = voz local del sistema. */
export const VOICES: Record<string, string> = { dalia: 'es-MX-DaliaNeural', jorge: 'es-MX-JorgeNeural', elvira: 'es-ES-ElviraNeural', alvaro: 'es-ES-AlvaroNeural' }

/** Duración de un audio leyendo la cabecera que imprime FFmpeg. */
async function audioSeconds(file: string): Promise<number | null> {
  const err = await run(ffmpegBin(), ['-hide_banner', '-i', file], { windowsHide: true }).then(() => '', (e: { stderr?: string }) => e.stderr ?? '')
  const m = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null
}

async function speakSapi(text: string, out: string, signal: AbortSignal): Promise<{ file: string; sec: number } | null> {
  try {
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', TTS_PS], { env: { ...process.env, NX_OUT: out, NX_TEXT: text }, windowsHide: true, timeout: 60000, signal })
    const b = fs.readFileSync(out)
    const byteRate = b.readUInt32LE(28)
    return byteRate > 0 ? { file: out, sec: (b.length - 44) / byteRate } : null
  } catch (e) {
    if (signal.aborted) throw e
    return null
  }
}

async function speakNeural(tts: MsEdgeTTS, text: string, dir: string, name: string): Promise<{ file: string; sec: number } | null> {
  const sub = path.join(dir, name)
  fs.mkdirSync(sub, { recursive: true })
  // la lectura va un poco más pausada que la de por defecto: suena más cercana en un tutorial
  const { audioFilePath } = await tts.toFile(sub, text, { rate: '-4%' })
  const sec = await audioSeconds(audioFilePath)
  return sec ? { file: audioFilePath, sec } : null
}

// ── Efectos en la página: cursor visible, resaltado y subtítulo ──────────────────────────────────────────
const OVERLAY_JS = `(() => {
  const add = () => {
    if (document.getElementById('__nx_cursor')) return
    const c = document.createElement('div')
    c.id = '__nx_cursor'
    c.style.cssText = 'position:fixed;left:-40px;top:-40px;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,159,28,.55);border:2px solid #ff9f1c;box-shadow:0 0 0 4px rgba(255,159,28,.25);pointer-events:none;z-index:2147483647;transition:transform .12s'
    const k = document.createElement('div')
    k.id = '__nx_caption'
    k.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:80%;padding:10px 18px;border-radius:10px;background:rgba(15,20,35,.88);color:#fff;font:600 20px/1.35 system-ui,sans-serif;text-align:center;pointer-events:none;z-index:2147483647;display:none'
    document.documentElement.append(c, k)
    document.addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px' }, true)
    document.addEventListener('mousedown', (e) => {
      c.style.transform = 'scale(.7)'
      // onda que se expande desde el clic, típica de los videos demo
      const r = document.createElement('div')
      r.style.cssText = 'position:fixed;left:' + e.clientX + 'px;top:' + e.clientY + 'px;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:3px solid #ff9f1c;pointer-events:none;z-index:2147483646;opacity:.9;transition:transform .55s ease-out,opacity .55s ease-out'
      document.documentElement.append(r)
      requestAnimationFrame(() => { r.style.transform = 'scale(4.5)'; r.style.opacity = '0' })
      setTimeout(() => r.remove(), 650)
    }, true)
    document.addEventListener('mouseup', () => { c.style.transform = '' }, true)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add()
  window.__nxCaption = (t) => { add(); const k = document.getElementById('__nx_caption'); k.textContent = t || ''; k.style.display = t ? 'block' : 'none' }
})()`

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const visible = (l: Locator, ms: number): Promise<boolean> => l.waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false)

/**
 * Localiza el control del paso. La IA solo vio la primera pantalla, así que el selector de pantallas posteriores
 * suele ser aproximado: si no aparece, se busca por rol/texto/placeholder sin distinguir mayúsculas ni texto exacto.
 * Si tampoco así, el error lista lo que sí hay en pantalla para poder corregir el guion.
 */
async function resolve(page: Page, target: string, click = false): Promise<Locator> {
  const m = target.match(/^text\s*=\s*["']?(.+?)["']?\s*$/i)
  if (click && m) {
    // «Sign in» suele ser también el título de la pantalla: al hacer clic se prefiere un control (botón/enlace/submit) con ese texto
    const name = new RegExp(`^\\s*${m[1].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i')
    const v = m[1].trim().replace(/["\\]/g, '')
    const ctl = [page.getByRole('button', { name }), page.locator(`input[type=submit][value="${v}" i], input[type=button][value="${v}" i]`), page.getByRole('link', { name })]
    for (const c of ctl) if (await visible(c.first(), 1200)) return c.first()
  }
  const exact = page.locator(target).first()
  if (await visible(exact, 4000)) return exact
  const word = (m ? m[1] : target.replace(/^[#.[\]]|["'\]]/g, '')).trim()
  if (word.length > 1) {
    const re = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    const tries = [
      ...(['link', 'button', 'menuitem', 'tab', 'option'] as const).map((r) => page.getByRole(r, { name: re }).first()),
      page.getByPlaceholder(re).first(),
      page.getByLabel(re).first(),
      page.getByText(re).first()
    ]
    for (const t of tries) if (await visible(t, 700)) return t
  }
  const seen = (await readControls(page).catch(() => '')).split('\n').filter((l) => l.includes(' | ')).slice(0, 25).map((l) => l.split(' | ')[1]).filter((t) => t && t !== '—')
  throw new Error(`no se encontró «${target}» en la pantalla. Lo que sí hay: ${seen.join(', ') || 'nada visible'}`)
}

/** Ejecuta un paso del guion en la página. Los selectores que no existen fallan en `ACTION_MS`. */
async function perform(page: Page, s: VideoStep, login?: VideoLogin, onBox?: (b: { x: number; y: number; width: number; height: number }) => void): Promise<void> {
  const num = (v?: string, d = 0): number => (Number.isFinite(Number(v)) && v ? Number(v) : d)
  switch (s.action) {
    case 'goto':
      await page.goto(s.target || '', { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined)
      return
    case 'click':
    case 'fill': {
      const el = await resolve(page, s.target || '', s.action === 'click')
      await el.scrollIntoViewIfNeeded({ timeout: ACTION_MS })
      await el.evaluate((n) => {
        const h = n as HTMLElement
        const prev = h.style.outline
        h.style.outline = '3px solid #ff9f1c'
        h.style.outlineOffset = '3px'
        setTimeout(() => { h.style.outline = prev }, 2500)
      })
      const box = await el.boundingBox()
      if (box) onBox?.(box)
      if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 })
      await sleep(350)
      if (s.action === 'click') await el.click({ timeout: ACTION_MS })
      else {
        await el.click({ timeout: ACTION_MS })
        await el.fill('')
        // {{usuario}} y {{contraseña}} se sustituyen aquí: la IA nunca ve las credenciales
        const text = (s.value ?? '').replace(/\{\{\s*usuario\s*\}\}/gi, () => login?.user ?? '').replace(/\{\{\s*contrase(?:ñ|n)a\s*\}\}/gi, () => login?.password ?? '')
        await el.pressSequentially(text, { delay: 55 })
      }
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => undefined)
      return
    }
    case 'press':
      await page.keyboard.press(s.value || s.target || 'Enter')
      return
    case 'scroll':
      await page.mouse.wheel(0, num(s.target ?? s.value, 400))
      return
    case 'wait':
      await sleep(num(s.target ?? s.value, 1000))
  }
}

export interface RecordOptions {
  steps: VideoStep[]
  url: string
  login?: VideoLogin
  dir: string
  signal: AbortSignal
  progress: (text: string) => void
  /** Vista en vivo: recibe un fotograma JPEG (base64) cada cierto tiempo mientras se graba. */
  onFrame?: (jpegBase64: string) => void
  /** Clave de VOICES, o 'sapi' para la voz local. Por defecto, la neuronal femenina de México. */
  voice?: string
}

interface Seg { t0: number; t1: number; cx: number; cy: number; z: number }
interface Cap { t0: number; t1: number; text: string }
interface Box { x: number; y: number; width: number; height: number }
/** Lo que queda en disco de una grabación: tiempos (ms desde el primer fotograma), cajas de los controles y audios de cada paso. */
interface Session { sigs: string[]; starts: number[]; ends: number[]; boxes: Array<Box | null>; audio: Array<{ file: string; sec: number } | null> }

/** Lo que define la grabación de un paso: si cambia, el montaje rápido ya no vale y hay que volver a grabar. */
const sig = (s: VideoStep): string => JSON.stringify([s.action, s.action === 'goto' ? '' : s.target ?? '', s.value ?? '', s.say.trim()]) // la URL de goto se normaliza al grabar

// controles pequeños se acercan más; los grandes (paneles enteros) apenas o nada
const zoomFor = (b: Box): number => (b.width < 420 && b.height < 160 ? 1.7 : b.width < 800 && b.height < 320 ? 1.4 : 0)

/**
 * Decide dónde acerca la cámara. Los pasos seguidos sobre la misma zona (p. ej. rellenar varios campos de un formulario
 * o escribir y pulsar Enter) comparten UN solo acercamiento en vez de entrar y salir en cada paso.
 */
function planZooms(steps: VideoStep[], ses: Session): Seg[] {
  const out: Seg[] = []
  let g: { box: Box; t0: number; t1: number; force: boolean } | null = null
  const flush = (): void => {
    if (g) {
      const z = zoomFor(g.box) || (g.force ? 1.35 : 0)
      if (z && g.t1 > g.t0) out.push({ t0: g.t0, t1: g.t1, cx: g.box.x + g.box.width / 2, cy: g.box.y + g.box.height / 2, z })
    }
    g = null
  }
  steps.forEach((s, i) => {
    const t0 = Math.max(0, ses.starts[i] / 1000) + 0.15
    const t1 = ses.ends[i] / 1000 - 0.15
    const b = ses.boxes[i]
    if (s.zoom === 'off') return flush()
    if (b && (s.action === 'click' || s.action === 'fill')) {
      const force = s.zoom === 'in'
      if (g) {
        const x0 = Math.min(g.box.x, b.x)
        const y0 = Math.min(g.box.y, b.y)
        const u: Box = { x: x0, y: y0, width: Math.max(g.box.x + g.box.width, b.x + b.width) - x0, height: Math.max(g.box.y + g.box.height, b.y + b.height) - y0 }
        if (zoomFor(u) > 0) {
          g = { box: u, t0: g.t0, t1, force: g.force || force }
          return
        }
        flush()
      }
      g = { box: b, t0, t1, force }
    } else if (g && s.action === 'press') g.t1 = t1
    else flush()
  })
  flush()
  return out
}

/**
 * Monta el MP4 final (zoom, subtítulos y voz) a partir de la grabación guardada en «session».
 * Solo el zoom puede haber cambiado desde la grabación; si cambió otra cosa hay que volver a grabar.
 */
export async function renderSession(dir: string, steps: VideoStep[], signal: AbortSignal, progress: (text: string) => void): Promise<string> {
  const sd = path.join(dir, 'session')
  let ses: Session
  try {
    ses = JSON.parse(fs.readFileSync(path.join(sd, 'session.json'), 'utf8')) as Session
  } catch {
    throw new Error('Este video no tiene una grabación guardada: grábalo de nuevo.')
  }
  if (ses.sigs.length !== steps.length || steps.some((s, i) => sig(s) !== ses.sigs[i])) {
    throw new Error('Cambiaste pasos, selectores o narración desde la última grabación. Sin grabar de nuevo solo se puede ajustar el zoom.')
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-video-'))
  try {
    progress('Montando el MP4…')
    const audio = ses.audio.map((a, i) => (a ? { file: path.join(sd, a.file), at: Math.max(0, ses.starts[i]) } : null)).filter((x): x is { file: string; at: number } => !!x)
    const caps: Cap[] = steps.map((s, i) => ({ t0: Math.max(0, ses.starts[i] / 1000) + 0.1, t1: ses.ends[i] / 1000 - 0.1, text: s.say.trim() })).filter((c) => c.text && c.t1 > c.t0)
    const out = path.join(dir, 'video.mp4')
    // se monta en un archivo aparte: si falla, el video anterior sigue intacto
    const next = path.join(dir, 'video.new.mp4')
    await mux(path.join(sd, 'raw.mp4'), audio, caps, planZooms(steps, ses), next, tmp, signal)
    fs.renameSync(next, out)
    return out
  } finally {
    fs.rmSync(path.join(dir, 'video.new.mp4'), { force: true })
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/** Graba el guion y devuelve la ruta del MP4. Orden: login sin video → voz por paso → grabación → montaje con FFmpeg. */
export async function recordVideo(o: RecordOptions): Promise<string> {
  const { steps, signal, progress } = o
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-video-'))
  const browser = await launchBrowser()
  const onAbort = (): void => void browser.close().catch(() => undefined)
  signal.addEventListener('abort', onAbort)
  try {
    let state: Awaited<ReturnType<import('playwright-core').BrowserContext['storageState']>> | undefined
    if (o.login && !o.login.showLogin) {
      progress('Iniciando sesión…')
      const c0 = await browser.newContext({ viewport: VIEWPORT })
      await doLogin(await c0.newPage(), o.url, o.login)
      state = await c0.storageState()
      await c0.close()
    }

    // la voz se genera antes de grabar: así cada paso dura lo que dura su narración
    const wavs: Array<{ file: string; sec: number } | null> = []
    let neural: MsEdgeTTS | null = null
    const voiceName = o.voice === 'sapi' ? '' : VOICES[o.voice ?? 'dalia'] ?? VOICES.dalia
    if (voiceName) {
      try {
        neural = new MsEdgeTTS({ connectionTimeoutMs: 10000, synthesisTimeoutMs: 30000 })
        await neural.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
      } catch {
        progress('Sin conexión para la voz natural: uso la voz local del sistema.')
        neural = null
      }
    }
    for (let i = 0; i < steps.length; i++) {
      if (signal.aborted) throw new Error('Cancelado.')
      progress(`Generando la voz (${i + 1}/${steps.length})…`)
      const text = steps[i].say.trim()
      let w: { file: string; sec: number } | null = null
      if (text && neural) {
        try {
          w = await speakNeural(neural, text, tmp, `v${i}`)
        } catch {
          neural = null // si la red falla a mitad, el resto va con la voz local
        }
      }
      if (text && !w) w = await speakSapi(text, path.join(tmp, `s${i}.wav`), signal)
      wavs.push(w)
    }
    neural?.close()

    const ctx = await browser.newContext({ viewport: VIEWPORT, storageState: state })
    await ctx.addInitScript(OVERLAY_JS)
    const page = await ctx.newPage()
    // el video se arma con fotogramas del screencast de Chromium (no necesita el FFmpeg propio de Playwright, que habría que descargar)
    const cdp = await ctx.newCDPSession(page)
    const frames: Array<{ file: string; at: number }> = []
    const t0 = Date.now()
    let shown = 0
    cdp.on('Page.screencastFrame', (f: { data: string; sessionId: number }) => {
      const file = path.join(tmp, `f${frames.length}.jpg`)
      fs.writeFileSync(file, Buffer.from(f.data, 'base64'))
      frames.push({ file, at: Date.now() - t0 })
      if (o.onFrame && Date.now() - shown > 250) {
        shown = Date.now()
        o.onFrame(f.data)
      }
      void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined)
    })
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: VIEWPORT.width, maxHeight: VIEWPORT.height, everyNthFrame: 1 })
    const starts: number[] = []
    const ends: number[] = []
    const boxes: Array<{ x: number; y: number; width: number; height: number } | null> = []
    for (let i = 0; i < steps.length; i++) {
      if (signal.aborted) throw new Error('Cancelado.')
      const s = steps[i]
      progress(`Grabando paso ${i + 1} de ${steps.length}…`)
      const begin = Date.now()
      boxes[i] = null
      if (s.action === 'goto') await perform(page, s, o.login).catch((e) => { throw stepError(i, s, e) })
      starts[i] = Date.now() - t0
      // el subtítulo ya no se pinta en la página: se superpone al final con FFmpeg para que el zoom no lo deforme
      if (s.action !== 'goto') await perform(page, s, o.login, (b) => { boxes[i] = b }).catch((e) => { throw stepError(i, s, e) })
      // el paso dura al menos lo que dura la narración (más un respiro)
      const need = Math.max((wavs[i]?.sec ?? 0) * 1000 + 500, 1500)
      const left = need - (Date.now() - (s.action === 'goto' ? t0 + starts[i] : begin))
      if (left > 0) await sleep(left)
      ends[i] = Date.now() - t0
    }
    await sleep(600)
    const endAt = Date.now() - t0
    await cdp.send('Page.stopScreencast').catch(() => undefined)
    await ctx.close()
    if (!frames.length) throw new Error('No se capturó ningún fotograma de la página.')
    // lista para el demuxer «concat»: cada fotograma dura hasta el siguiente (el último, hasta el final)
    const fwd = (f: string): string => f.split(path.sep).join('/')
    const list: string[] = []
    frames.forEach((f, i) => {
      const sec = ((frames[i + 1]?.at ?? endAt) - f.at) / 1000
      list.push(`file '${fwd(f.file)}'`, `duration ${(sec > 0 ? sec : 0.04).toFixed(3)}`)
    })
    list.push(`file '${fwd(frames[frames.length - 1].file)}'`) // el demuxer ignora la duración del último, hay que repetirlo
    const listFile = path.join(tmp, 'frames.txt')
    fs.writeFileSync(listFile, list.join('\n'))

    // Se guarda la grabación «en crudo» (sin zoom ni subtítulos) con los audios y los tiempos de cada paso:
    // así el zoom se puede reajustar después sin volver a recorrer la app ni regenerar la voz.
    progress('Guardando la grabación…')
    fs.mkdirSync(o.dir, { recursive: true })
    const sd = path.join(o.dir, 'session')
    fs.rmSync(sd, { recursive: true, force: true })
    fs.mkdirSync(sd, { recursive: true })
    await run(ffmpegBin(), ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', 'fps=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '16', '-an', path.join(sd, 'raw.mp4')], { windowsHide: true, timeout: 900000, signal, maxBuffer: 16 * 1024 * 1024, cwd: tmp })
    // la línea de tiempo del video empieza en el primer fotograma, no en t0
    const base = frames[0].at
    const audio = wavs.map((w, i) => {
      if (!w) return null
      const name = `a${i}${path.extname(w.file)}`
      fs.copyFileSync(w.file, path.join(sd, name))
      return { file: name, sec: w.sec }
    })
    const ses: Session = { sigs: steps.map(sig), starts: starts.map((t) => t - base), ends: ends.map((t) => t - base), boxes, audio }
    fs.writeFileSync(path.join(sd, 'session.json'), JSON.stringify(ses))
    return await renderSession(o.dir, steps, signal, progress)
  } finally {
    signal.removeEventListener('abort', onAbort)
    await browser.close().catch(() => undefined)
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

function stepError(i: number, s: VideoStep, e: unknown): Error {
  const msg = (e as Error).message.split('\n')[0].slice(0, 500)
  return new Error(`El paso ${i + 1} (${s.action}${s.target ? ' ' + s.target : ''}) falló: ${msg}. Corrige el selector en el guion y vuelve a grabar.`)
}

/** FFmpeg viene empaquetado (ffmpeg-static); en la app instalada vive fuera del asar. */
function ffmpegBin(): string {
  const p = (ffmpegStatic as unknown as string | null)?.replace('app.asar', 'app.asar.unpacked')
  if (!p || !fs.existsSync(p)) throw new Error('No se encontró FFmpeg dentro de la aplicación.')
  return p
}

const assTime = (s: number): string => {
  const cs = Math.round(s * 100)
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`
}

/** Subtítulos con estilo (caja oscura translúcida, tipografía de sistema, entrada y salida suaves) en formato ASS. */
function buildAss(caps: Cap[]): string {
  const head = [
    '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1280', 'PlayResY: 720', 'WrapStyle: 0', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Cap,Segoe UI Semibold,30,&H00FFFFFF,&H00FFFFFF,&H33241A12,&H00000000,0,0,0,0,100,100,0.3,0,3,14,0,2,120,120,46,1', '',
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ]
  const lines = caps.map((c) => `Dialogue: 0,${assTime(c.t0)},${assTime(c.t1)},Cap,,0,0,0,,{\\fad(220,220)}${c.text.replace(/[{}]/g, '').replace(/\r?\n/g, ' ')}`)
  return [...head, ...lines].join('\n') + '\n'
}

/**
 * Expresión de FFmpeg para el zoom estilo «demo»: cada segmento acerca la cámara al control (con suavizado) y la aleja al acabar.
 * Devuelve zoom y centro (en px del video original) en función del tiempo T = on/30.
 */
function zoomExprs(segs: Seg[]): { z: string; cx: string; cy: string } {
  const ss = (u: string): string => `(${u})*(${u})*(3-2*(${u}))`
  const bump = (s: Seg): string => {
    const r = Math.min(0.7, (s.t1 - s.t0) / 2).toFixed(3)
    const up = `clip((on/30-${s.t0.toFixed(3)})/${r},0,1)`
    const down = `clip((on/30-${(s.t1 - Number(r)).toFixed(3)})/${r},0,1)`
    return `(${ss(up)}-${ss(down)})`
  }
  const bs = segs.map(bump)
  const sum = bs.join('+')
  return {
    z: `1+${segs.map((s, k) => `${(s.z - 1).toFixed(2)}*${bs[k]}`).join('+')}`,
    cx: `(${segs.map((s, k) => `${s.cx.toFixed(1)}*${bs[k]}`).join('+')})/(${sum}+0.0001)`,
    cy: `(${segs.map((s, k) => `${s.cy.toFixed(1)}*${bs[k]}`).join('+')})/(${sum}+0.0001)`
  }
}

async function mux(rawVideo: string, audio: Array<{ file: string; at: number }>, caps: Cap[], zooms: Seg[], out: string, tmp: string, signal: AbortSignal): Promise<void> {
  const args = ['-y', '-i', rawVideo]
  audio.forEach((a) => args.push('-i', a.file))
  const g: string[] = []
  // el zoom trabaja sobre una copia al doble de tamaño para que al acercar no se vea pixelado
  let v = '[0:v]fps=30'
  if (zooms.length) {
    const e = zoomExprs(zooms)
    v += `,scale=2560:1440:flags=bicubic,zoompan=z='${e.z}':x='max(0,min(iw-iw/(${e.z}),(${e.cx})*2-iw/(${e.z})/2))':y='max(0,min(ih-ih/(${e.z}),(${e.cy})*2-ih/(${e.z})/2))':d=1:s=1280x720:fps=30`
  }
  if (caps.length) {
    fs.writeFileSync(path.join(tmp, 'subs.ass'), buildAss(caps), 'utf8')
    v += ',ass=subs.ass:fontsdir=C\\\\:/Windows/Fonts'
  }
  g.push(`${v},format=yuv420p[v]`)
  if (audio.length) {
    audio.forEach((a, k) => g.push(`[${k + 1}:a]adelay=${Math.round(a.at)}|${Math.round(a.at)}[a${k}]`))
    g.push(`${audio.map((_, k) => `[a${k}]`).join('')}amix=inputs=${audio.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]`)
  }
  fs.writeFileSync(path.join(tmp, 'graph.txt'), g.join(';\n'), 'utf8')
  args.push('-filter_complex_script', path.join(tmp, 'graph.txt'), '-map', '[v]')
  if (audio.length) args.push('-map', '[a]', '-c:a', 'aac', '-b:a', '160k')
  else args.push('-an')
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '21', '-movflags', '+faststart', out)
  // cwd = carpeta temporal: así «subs.ass» se indica sin rutas de Windows (los «:» de «C:\» rompen los filtros)
  await run(ffmpegBin(), args, { windowsHide: true, timeout: 900000, signal, maxBuffer: 16 * 1024 * 1024, cwd: tmp })
}
