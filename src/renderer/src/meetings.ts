import { useEffect, useSyncExternalStore } from 'react'
import type { Meeting, MeetingPatch, MeetingTask } from '../../shared/types'

/**
 * Reuniones en el renderer. La grabadora vive a nivel de módulo (no en un componente) para que la grabación
 * siga activa aunque se cambie de vista. El audio se mezcla (micrófono + audio del sistema) a 16 kHz mono
 * y se envía al proceso principal en trozos de unos segundos, así una reunión larga no ocupa memoria.
 */

// ---------- lista de reuniones ----------
let list: Meeting[] = []
let loaded = false
const subs = new Set<() => void>()
const emit = (): void => subs.forEach((f) => f())
const setList = (next: Meeting[]): void => {
  list = next
  emit()
}
const upsert = (m: Meeting): void => setList([m, ...list.filter((x) => x.id !== m.id)].sort((a, b) => b.createdAt - a.createdAt))

export async function loadMeetings(): Promise<void> {
  loaded = true
  try {
    setList(await window.api.call('meetings:list'))
  } catch {
    loaded = false
  }
}

const processing = (m: Meeting): boolean => m.status === 'transcribing' || m.status === 'summarizing' || !!m.extracting

export function useMeetings(): Meeting[] {
  const meetings = useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => list
  )
  useEffect(() => {
    if (!loaded) void loadMeetings()
  }, [])
  // mientras alguna se transcribe o resume, se consulta el estado cada pocos segundos
  const waiting = meetings.some(processing)
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => void loadMeetings(), 3000)
    return () => clearInterval(t)
  }, [waiting])
  return meetings
}

export const updateMeeting = async (id: string, p: MeetingPatch): Promise<Meeting> => {
  const m = await window.api.call('meetings:update', id, p)
  upsert(m)
  return m
}
export const retryMeeting = async (id: string): Promise<void> => upsert(await window.api.call('meetings:retry', id))
export const resummarizeMeeting = async (id: string): Promise<void> => upsert(await window.api.call('meetings:summarize', id))
export const extractTasks = async (id: string): Promise<void> => upsert(await window.api.call('meetings:extract', id))
/** Crea las tareas elegidas y devuelve cuántas se crearon. */
export async function createTasks(id: string, tasks: MeetingTask[]): Promise<number> {
  const n = await window.api.call('meetings:createTasks', id, tasks)
  await loadMeetings()
  return n
}
export async function deleteMeeting(id: string): Promise<void> {
  await window.api.call('meetings:delete', id)
  setList(list.filter((x) => x.id !== id))
}

// ---------- grabadora ----------
export interface RecState {
  id: string
  title: string
  startedAt: number
  paused: boolean
  /** Si se está capturando también el audio del sistema (la voz del cliente). */
  system: boolean
}

let rec: RecState | null = null
const recSubs = new Set<() => void>()
const setRec = (next: RecState | null): void => {
  rec = next
  recSubs.forEach((f) => f())
}
export const useRecording = (): RecState | null =>
  useSyncExternalStore(
    (cb) => {
      recSubs.add(cb)
      return () => recSubs.delete(cb)
    },
    () => rec
  )

interface Live {
  ctx: AudioContext
  node: ScriptProcessorNode
  streams: MediaStream[]
  pending: Int16Array[]
  pendingLen: number
  queue: Promise<unknown>
  /** Tiempo grabado en ms (sin contar las pausas). */
  elapsed: number
}
let live: Live | null = null

const FLUSH_SAMPLES = 16000 * 4 // ~4 s por trozo

function send(l: Live, id: string, all: boolean): void {
  if (!l.pendingLen || (!all && l.pendingLen < FLUSH_SAMPLES)) return
  const out = new Int16Array(l.pendingLen)
  let o = 0
  for (const p of l.pending) {
    out.set(p, o)
    o += p.length
  }
  l.pending = []
  l.pendingLen = 0
  // en cola para que los trozos lleguen en orden
  l.queue = l.queue.then(() => window.api.call('meetings:chunk', id, out.buffer)).catch(() => undefined)
}

/** Empieza a grabar. Devuelve un aviso si no se pudo capturar el audio del sistema (se graba solo el micrófono). */
export async function startRecording(title: string, taskId: string | undefined, system: boolean): Promise<string | undefined> {
  if (rec) throw new Error('Ya hay una grabación en curso.')
  let warning: string | undefined
  const streams: MediaStream[] = []
  const ctx = new AudioContext({ sampleRate: 16000 })
  try {
    const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    streams.push(mic)
    const mix = ctx.createGain()
    ctx.createMediaStreamSource(mic).connect(mix)
    let withSystem = false
    if (system) {
      try {
        const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        display.getVideoTracks().forEach((t) => t.stop()) // solo interesa el audio
        if (display.getAudioTracks().length) {
          const only = new MediaStream(display.getAudioTracks())
          streams.push(only)
          ctx.createMediaStreamSource(only).connect(mix)
          withSystem = true
        } else warning = 'No se pudo capturar el audio del sistema: se graba solo tu micrófono.'
      } catch {
        warning = 'No se pudo capturar el audio del sistema: se graba solo tu micrófono.'
      }
    }
    const id = await window.api.call('meetings:start', title, taskId)
    const node = ctx.createScriptProcessor(4096, 1, 1)
    const l: Live = { ctx, node, streams, pending: [], pendingLen: 0, queue: Promise.resolve(), elapsed: 0 }
    live = l
    node.onaudioprocess = (e) => {
      if (rec?.paused) return
      const f = e.inputBuffer.getChannelData(0)
      const pcm = new Int16Array(f.length)
      for (let i = 0; i < f.length; i++) pcm[i] = Math.max(-1, Math.min(1, f[i])) * 0x7fff
      l.pending.push(pcm)
      l.pendingLen += pcm.length
      l.elapsed += (f.length / 16000) * 1000
      send(l, id, false)
    }
    mix.connect(node)
    node.connect(ctx.destination) // sin salida no se dispara el procesado; no se escribe nada en la salida, así que no suena
    setRec({ id, title, startedAt: Date.now(), paused: false, system: withSystem })
    return warning
  } catch (e) {
    streams.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    void ctx.close()
    const err = e as Error
    throw new Error(err.name === 'NotAllowedError' || err.name === 'NotFoundError' ? 'No se pudo acceder al micrófono. Revisa los permisos de Windows (Privacidad → Micrófono).' : err.message)
  }
}

export const pauseRecording = (paused: boolean): void => {
  if (rec) setRec({ ...rec, paused })
}

/** Cierra la grabación y lanza la transcripción y el resumen en segundo plano. */
export async function stopRecording(): Promise<Meeting | null> {
  const r = rec
  const l = live
  if (!r || !l) return null
  l.node.onaudioprocess = null
  l.node.disconnect()
  l.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()))
  void l.ctx.close()
  send(l, r.id, true)
  await l.queue
  live = null
  setRec(null)
  const m = await window.api.call('meetings:stop', r.id, l.elapsed)
  upsert(m)
  return m
}
