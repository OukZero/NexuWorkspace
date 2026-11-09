// Login con AWS Cognito (User Pool con registro público desactivado y app client público, sin secret).
// Habla directamente con la API pública de Cognito por HTTPS: no hay SDK ni credenciales de AWS en la app.
// El refresh token se guarda cifrado con safeStorage (DPAPI en Windows); el access token solo vive en memoria.
import { app, powerMonitor, safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'
import type { AuthStatus } from '../shared/types'
import { broadcast } from './db'

interface AuthConfig {
  /** false = login desactivado (la app funciona como antes, sin AWS). Ver docs/AUTH-DESACTIVADO.md. */
  enabled: boolean
  region: string
  userPoolId: string
  clientId: string
  apiUrl: string
}

interface Stored {
  refreshToken: string
  email: string
  /** Momento del login: el refresh token de Cognito caduca RefreshTokenValidity días después (30 en infra/template.yaml). */
  issuedAt: number
}

const REFRESH_DAYS = 30
const DAY = 86_400_000
const RETRY_MS = 60_000

class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public raw = ''
  ) {
    super(message)
  }
}

let cfg: AuthConfig = { enabled: false, region: '', userPoolId: '', clientId: '', apiUrl: '' }
let status: AuthStatus = { configured: false, signedIn: false }
let stored: Stored | null = null
let access: { token: string; exp: number } | null = null
let challenge: { session: string; email: string } | null = null
let timer: NodeJS.Timeout | undefined
let bypass = false

const sessionFile = (): string => path.join(app.getPath('userData'), 'session.bin')

// ---------- configuración ----------
function loadConfig(): void {
  let file: Partial<AuthConfig> = {}
  try {
    file = JSON.parse(fs.readFileSync(path.join(__dirname, '../../resources/auth.config.json'), 'utf8')) as Partial<AuthConfig>
  } catch {
    /* sin archivo: se usan las variables de entorno */
  }
  const env = process.env
  cfg = {
    enabled: file.enabled === true || env['SHUTOKI_AUTH'] === 'on',
    region: env['SHUTOKI_COGNITO_REGION'] || file.region || '',
    userPoolId: env['SHUTOKI_COGNITO_USER_POOL_ID'] || file.userPoolId || '',
    clientId: env['SHUTOKI_COGNITO_CLIENT_ID'] || file.clientId || '',
    apiUrl: env['SHUTOKI_API_URL'] || file.apiUrl || ''
  }
}
const configured = (): boolean => !!(cfg.region && cfg.clientId)

/** Datos de la API de sincronización (etapa 2). */
export const getApiUrl = (): string => cfg.apiUrl

// ---------- cliente de Cognito ----------
async function cognito<T>(target: string, body: Record<string, unknown>): Promise<T> {
  let res: Response
  try {
    res = await fetch(`https://cognito-idp.${cfg.region}.amazonaws.com/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000)
    })
  } catch {
    throw new AuthError('Network', 'Sin conexión con el servicio de acceso. Revisa tu internet.')
  }
  const json = (await res.json().catch(() => ({}))) as { __type?: string; message?: string; Message?: string }
  if (!res.ok) {
    const code = String(json.__type ?? '').split('#').pop() || `HTTP${res.status}`
    const raw = json.message ?? json.Message ?? ''
    throw new AuthError(code, explain(code, raw), raw)
  }
  return json as T
}

function explain(code: string, msg: string): string {
  if (code === 'NotAuthorizedException') {
    if (/disabled/i.test(msg)) return 'Tu acceso fue desactivado. Habla con el administrador.'
    if (/refresh token/i.test(msg)) return 'La sesión caducó. Vuelve a iniciar sesión.'
    return 'Correo o contraseña incorrectos.'
  }
  switch (code) {
    case 'UserNotFoundException':
      return 'Correo o contraseña incorrectos.'
    case 'UserNotConfirmedException':
      return 'El usuario aún no está confirmado. Habla con el administrador.'
    case 'PasswordResetRequiredException':
      return 'Debes restablecer tu contraseña: usa «Olvidé mi contraseña».'
    case 'InvalidPasswordException':
      return 'La contraseña no cumple la política (mínimo 10 caracteres, mayúscula, minúscula y número).'
    case 'CodeMismatchException':
      return 'El código no es correcto.'
    case 'ExpiredCodeException':
      return 'El código caducó. Pide uno nuevo.'
    case 'LimitExceededException':
    case 'TooManyRequestsException':
    case 'TooManyFailedAttemptsException':
      return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'
    case 'InvalidParameterException':
      return msg || 'Datos no válidos.'
    default:
      return msg || `Error del servicio de acceso (${code}).`
  }
}

/** Cognito respondió que la cuenta o el token ya no sirven (no es un fallo de red ni del servicio). */
const isRejection = (e: unknown): e is AuthError =>
  e instanceof AuthError && ['NotAuthorizedException', 'UserNotFoundException', 'UserNotConfirmedException', 'PasswordResetRequiredException'].includes(e.code)

interface AuthResult {
  AuthenticationResult?: { AccessToken: string; IdToken?: string; RefreshToken?: string; ExpiresIn: number }
  ChallengeName?: string
  Session?: string
}

/** El correo sale del id token (solo para mostrarlo; la validación real la hace API Gateway con el JWT). */
function emailFromToken(jwt: string | undefined, fallback: string): string {
  try {
    const payload = JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8')) as { email?: string }
    return payload.email || fallback
  } catch {
    return fallback
  }
}

// ---------- persistencia cifrada ----------
function persist(): void {
  if (!stored || !safeStorage.isEncryptionAvailable()) return // sin cifrado disponible no se guarda nada en disco
  fs.writeFileSync(sessionFile(), safeStorage.encryptString(JSON.stringify(stored)))
}

function loadStored(): Stored | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    const s = JSON.parse(safeStorage.decryptString(fs.readFileSync(sessionFile()))) as Stored
    return s.refreshToken && s.email ? s : null
  } catch {
    return null
  }
}

function forget(): void {
  stored = null
  access = null
  challenge = null
  clearTimeout(timer)
  fs.rmSync(sessionFile(), { force: true })
}

// ---------- estado ----------
function setStatus(next: AuthStatus): void {
  const changed = JSON.stringify(next) !== JSON.stringify(status)
  status = next
  if (changed) {
    broadcast('auth', status)
    for (const l of listeners) l(status)
  }
}

const listeners = new Set<(s: AuthStatus) => void>()
/** Avisa cuando cambia la sesión (la etapa 2 arranca/detiene la sincronización con esto). */
export function onAuthChange(cb: (s: AuthStatus) => void): void {
  listeners.add(cb)
}

export const getStatus = (): AuthStatus => status
export const isSignedIn = (): boolean => status.signedIn

const signedOut = (reason?: 'expired' | 'revoked'): AuthStatus => ({ configured: configured(), signedIn: false, ...(reason ? { reason } : {}) })

function applyTokens(r: NonNullable<AuthResult['AuthenticationResult']>): void {
  access = { token: r.AccessToken, exp: Date.now() + r.ExpiresIn * 1000 }
  schedule(Math.max(30_000, r.ExpiresIn * 1000 - 5 * 60_000))
}

function schedule(ms: number): void {
  clearTimeout(timer)
  timer = setTimeout(() => void refresh(), ms)
}

/** Renueva el access token. También es lo que detecta a un usuario desactivado o con la sesión revocada. */
async function refresh(): Promise<void> {
  const sent = stored
  if (!sent) return
  try {
    const r = await cognito<AuthResult>('InitiateAuth', {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: cfg.clientId,
      AuthParameters: { REFRESH_TOKEN: sent.refreshToken }
    })
    if (stored !== sent) return // se cerró la sesión mientras tanto
    if (!r.AuthenticationResult) throw new AuthError('Unexpected', 'Respuesta inesperada del servicio de acceso.')
    applyTokens(r.AuthenticationResult)
    setStatus({ configured: true, signedIn: true, email: stored.email })
  } catch (e) {
    if (stored !== sent) return
    if (isRejection(e)) {
      // el servidor dijo que no: acceso revocado/desactivado, o el refresh token caducó
      const revoked = /disabled|revoked/i.test(e.raw) || e.code === 'UserNotFoundException'
      forget()
      setStatus(signedOut(revoked ? 'revoked' : 'expired'))
      return
    }
    // sin internet o fallo transitorio del servicio: la app sigue funcionando mientras no pase la vigencia del refresh token
    if (Date.now() < stored.issuedAt + REFRESH_DAYS * DAY) {
      setStatus({ configured: true, signedIn: true, email: stored.email, offline: true })
      schedule(RETRY_MS)
    } else {
      forget()
      setStatus(signedOut('expired'))
    }
  }
}

/** Token para llamar a la API de sincronización (null si no hay sesión o está sin conexión). */
export async function getAccessToken(): Promise<string | null> {
  if (!status.signedIn) return null
  if (!access || access.exp - Date.now() < 60_000) await refresh()
  return access && status.signedIn && !status.offline ? access.token : null
}

// ---------- arranque ----------
export async function initAuth(): Promise<void> {
  loadConfig()
  // atajo solo para desarrollo, sin Cognito: SHUTOKI_AUTH=off npm run dev (nunca en la app instalada)
  // login desactivado (todavía no hay AWS): la app se comporta como antes, sin pedir sesión
  if (!cfg.enabled || (!app.isPackaged && process.env['SHUTOKI_AUTH'] === 'off')) {
    bypass = true
    status = { configured: true, signedIn: true, disabled: true }
    return
  }
  status = signedOut()
  if (!configured()) return
  powerMonitor.on('resume', () => void refresh()) // al despertar el equipo se revalida (puede haberse revocado el acceso)
  stored = loadStored()
  if (stored) await refresh()
}

// ---------- acciones ----------
function finish(r: AuthResult, email: string): AuthStatus {
  const a = r.AuthenticationResult
  if (!a?.RefreshToken) throw new AuthError('Unexpected', 'Respuesta inesperada del servicio de acceso.')
  stored = { refreshToken: a.RefreshToken, email: emailFromToken(a.IdToken, email), issuedAt: Date.now() }
  persist()
  challenge = null
  applyTokens(a)
  setStatus({ configured: true, signedIn: true, email: stored.email })
  return status
}

function requireConfig(): void {
  if (!configured()) throw new Error('El acceso no está configurado: falta resources/auth.config.json (ver infra/README.md).')
}

export async function signIn(email: string, password: string): Promise<AuthStatus> {
  requireConfig()
  const username = email.trim().toLowerCase()
  const r = await cognito<AuthResult>('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: cfg.clientId,
    AuthParameters: { USERNAME: username, PASSWORD: password }
  })
  if (r.ChallengeName === 'NEW_PASSWORD_REQUIRED' && r.Session) {
    challenge = { session: r.Session, email: username }
    return { configured: true, signedIn: false, email: username, needsNewPassword: true }
  }
  return finish(r, username)
}

export async function setNewPassword(newPassword: string): Promise<AuthStatus> {
  if (!challenge) throw new Error('Vuelve a iniciar sesión con tu contraseña temporal.')
  const r = await cognito<AuthResult>('RespondToAuthChallenge', {
    ChallengeName: 'NEW_PASSWORD_REQUIRED',
    ClientId: cfg.clientId,
    Session: challenge.session,
    ChallengeResponses: { USERNAME: challenge.email, NEW_PASSWORD: newPassword }
  })
  return finish(r, challenge.email)
}

export async function signOut(): Promise<void> {
  if (bypass) return // login desactivado: no hay sesión que cerrar
  const token = stored?.refreshToken
  forget()
  setStatus(signedOut())
  if (token && !bypass) await cognito('RevokeToken', { ClientId: cfg.clientId, Token: token }).catch(() => undefined) // sin red igual queda cerrada en este equipo
}

export async function forgotPassword(email: string): Promise<void> {
  requireConfig()
  await cognito('ForgotPassword', { ClientId: cfg.clientId, Username: email.trim().toLowerCase() })
}

export async function confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
  requireConfig()
  await cognito('ConfirmForgotPassword', { ClientId: cfg.clientId, Username: email.trim().toLowerCase(), ConfirmationCode: code.trim(), Password: newPassword })
}
