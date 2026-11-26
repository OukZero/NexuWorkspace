// El token de Actualizaciones se publica en process.env.GH_TOKEN para electron-updater, pero los procesos hijo (Copilot, terminal,
// Claude…) no deben heredarlo: Copilot prioriza GH_TOKEN sobre su login y ese token de solo lectura no tiene «Copilot Requests».
let injected = ''

export function markInjectedToken(t: string): void {
  injected = t
}

/** Entorno para procesos hijo: igual que process.env pero sin el token que puso el actualizador. */
export function childEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env = { ...process.env, ...extra } as Record<string, string>
  if (injected && env.GH_TOKEN === injected) delete env.GH_TOKEN
  return env
}
