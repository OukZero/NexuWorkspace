import type { ChatUsage, Settings } from './types'

export type AdviceLevel = 'none' | 'ok' | 'warn' | 'critical'

export interface Advice {
  level: AdviceLevel
  title: string
  text: string
  pct: number // % de la ventana del modelo
}

export const fmtTokens = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

/**
 * Recomendación según el tamaño del contexto. Cada turno reenvía todo el contexto (aunque casi todo sale de caché),
 * así que conversaciones largas cuestan más y Claude pierde precisión: conviene compactar antes de llegar al límite.
 */
export function contextAdvice(u: ChatUsage | undefined, s: Pick<Settings, 'contextWarnTokens' | 'contextCriticalTokens'>): Advice {
  if (!u || !u.contextTokens) return { level: 'none', title: 'Sin datos todavía', text: 'El consumo aparece después de la primera respuesta de Claude.', pct: 0 }
  const pct = u.contextWindow ? (u.contextTokens / u.contextWindow) * 100 : 0
  const critical = Math.min(s.contextCriticalTokens, (u.contextWindow || Infinity) * 0.8)
  const warn = Math.min(s.contextWarnTokens, (u.contextWindow || Infinity) * 0.5)
  if (u.contextTokens >= critical) {
    return {
      level: 'critical',
      title: 'Compacta ahora',
      text: 'El contexto es muy grande: cada mensaje es más lento y caro, y Claude puede perder detalles. Compacta la conversación (se conserva el historial visible). Si vas a cambiar de tema, mejor reinicia el chat.',
      pct
    }
  }
  if (u.contextTokens >= warn) {
    return {
      level: 'warn',
      title: 'Compacta pronto',
      text: 'Buen momento para compactar cuando termines la subtarea actual. Si vas a empezar algo distinto, abre una conversación nueva.',
      pct
    }
  }
  return { level: 'ok', title: 'Contexto saludable', text: 'Puedes seguir en esta conversación.', pct }
}
