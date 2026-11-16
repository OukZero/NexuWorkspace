import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { AuthStatus } from '../../../shared/types'

type Step = 'signin' | 'newpass' | 'forgot' | 'reset'

const REASONS: Record<NonNullable<AuthStatus['reason']>, string> = {
  expired: 'Tu sesión caducó. Inicia sesión de nuevo.',
  revoked: 'Tu acceso fue desactivado o revocado. Si crees que es un error, habla con el administrador.'
}

/** Pantalla de acceso: mientras no hay sesión válida es lo único que muestra la app. */
export function Login({ status }: { status: AuthStatus }): ReactNode {
  const [step, setStep] = useState<Step>('signin')
  const [email, setEmail] = useState(status.email ?? '')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const go = (s: Step, msg = ''): void => {
    setStep(s)
    setError('')
    setInfo(msg)
    setPassword('')
    setPassword2('')
  }

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (step === 'signin') {
        const r = await window.api.call('auth:signIn', email, password)
        if (r.needsNewPassword) go('newpass', 'Es tu primer acceso: elige una contraseña nueva.')
        // con sesión iniciada el proceso principal avisa y la ventana se recarga sola
      } else if (step === 'newpass') {
        if (password !== password2) throw new Error('Las contraseñas no coinciden.')
        await window.api.call('auth:newPassword', password)
      } else if (step === 'forgot') {
        await window.api.call('auth:forgot', email)
        go('reset', 'Si el correo existe, te enviamos un código. Escríbelo con tu contraseña nueva.')
      } else {
        if (password !== password2) throw new Error('Las contraseñas no coinciden.')
        await window.api.call('auth:confirmForgot', email, code, password)
        go('signin', 'Contraseña actualizada. Ya puedes iniciar sesión.')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const title = { signin: 'Iniciar sesión', newpass: 'Nueva contraseña', forgot: 'Recuperar contraseña', reset: 'Restablecer contraseña' }[step]
  const action = { signin: 'Entrar', newpass: 'Guardar y entrar', forgot: 'Enviar código', reset: 'Cambiar contraseña' }[step]

  return (
    <div className="login">
      <form className="login-card" onSubmit={(e) => void submit(e)}>
        <h1>Nexu Workspace</h1>
        <div className="sub">{title}</div>

        {!status.configured && (
          <div className="login-msg err">El acceso no está configurado en esta instalación (falta resources/auth.config.json). Consulta infra/README.md.</div>
        )}
        {step === 'signin' && status.reason && !error && !info && <div className="login-msg err">{REASONS[status.reason]}</div>}
        {info && <div className="login-msg">{info}</div>}
        {error && <div className="login-msg err">{error}</div>}

        {(step === 'signin' || step === 'forgot' || step === 'reset') && (
          <>
            <label>Correo</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required autoComplete="username" />
          </>
        )}
        {step === 'reset' && (
          <>
            <label>Código recibido por correo</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} required inputMode="numeric" autoComplete="one-time-code" />
          </>
        )}
        {step !== 'forgot' && (
          <>
            <label>{step === 'signin' ? 'Contraseña' : 'Contraseña nueva'}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={step === 'signin' ? 'current-password' : 'new-password'} />
          </>
        )}
        {(step === 'newpass' || step === 'reset') && (
          <>
            <label>Repite la contraseña nueva</label>
            <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} required autoComplete="new-password" />
            <div className="meta">Mínimo 10 caracteres, con mayúscula, minúscula y número.</div>
          </>
        )}

        <button className="btn primary login-go" type="submit" disabled={busy || !status.configured}>
          {busy ? 'Un momento…' : action}
        </button>
        <div className="login-links">
          {step === 'signin' && (
            <button type="button" className="link" onClick={() => go('forgot')}>
              Olvidé mi contraseña
            </button>
          )}
          {step !== 'signin' && (
            <button type="button" className="link" onClick={() => go('signin')}>
              Volver
            </button>
          )}
        </div>
        <div className="meta login-foot">Los usuarios los crea el administrador. No hay registro público.</div>
      </form>
    </div>
  )
}
