import { useEffect, useState } from 'react'
import type { RecInfo } from '../../../shared/types'
import { recElapsed } from '../meetings'

const clock = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${m}:${r}` : `${m}:${r}`
}

/** Ventana flotante de grabación: avisa de que se está grabando, muestra el tiempo y deja pausar, detener y pedir preguntas. */
export function RecMini(): React.JSX.Element | null {
  const [rec, setRec] = useState<RecInfo | null>(null)
  const [now, setNow] = useState(Date.now())
  const [questions, setQuestions] = useState<string[]>([])
  const [asking, setAsking] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => window.api.onRecState(setRec), [])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  // la ventana crece para que quepan las preguntas
  useEffect(() => {
    void window.api.call('meetings:recResize', 110 + (questions.length || err ? 30 + Math.min(300, questions.length * 44) : 0)).catch(() => undefined)
  }, [questions.length, err])

  if (!rec) return null
  const paused = rec.pausedAt !== null

  const ask = async (): Promise<void> => {
    setAsking(true)
    setErr('')
    try {
      const qs = await window.api.call('meetings:liveQuestions', rec.id)
      setQuestions((a) => [...a, ...qs])
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="recmini" role="status" aria-live="polite">
      <div className="rtop">
        <span className={`rdot ${paused ? 'paused' : ''}`} aria-hidden />
        <span className="rtime">{clock(recElapsed(rec, now))}</span>
        <span className="rtitle" title={rec.title}>
          {paused ? 'En pausa · ' : 'Grabando · '}
          {rec.title}
        </span>
      </div>
      <div className="rbtns">
        <button onClick={() => void window.api.call('meetings:recCmd', paused ? 'resume' : 'pause')}>{paused ? 'Reanudar' : 'Pausar'}</button>
        <button className="stop" onClick={() => void window.api.call('meetings:recCmd', 'stop')}>
          Detener
        </button>
        <button disabled={asking} onClick={() => void ask()} title="Transcribe lo hablado hasta ahora y sugiere preguntas">
          {asking ? 'Escuchando…' : 'Preguntas'}
        </button>
      </div>
      {err && <div className="rerr">{err}</div>}
      {questions.length > 0 && (
        <ul aria-label="Preguntas sugeridas">
          {questions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
