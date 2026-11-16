import { useState } from 'react'
import type { ReactNode } from 'react'
import type { CommandPolicy, MiniFormat, OpenMode, Settings, SummaryMode, TerminalKind, TerminalMode } from '../../../shared/types'
import { useDB } from '../store'
import { useUi } from '../ui'
import { Select } from './Select'
import { AccountSettings } from './AccountSettings'
import { SpotifySettings } from './SpotifySettings'
import { CalendarSettings } from './CalendarSettings'
import { TelegramSettings } from './TelegramSettings'
import { TemplatesEditor } from './TemplatesEditor'
import { ProfilesEditor, TaskTemplatesEditor } from './ListEditors'
import { UpdateCard } from './UpdateCard'
import { AppearanceSettings } from './AppearanceSettings'
import { ALL_CONTEXT, CONTEXT_HINT, CONTEXT_LABEL, DEFAULT_CONTEXT, profilesOf, taskTemplatesOf, templatesOf } from '../../../shared/templates'

type Tab = 'general' | 'apariencia' | 'ia' | 'integraciones' | 'sistema' | 'datos'

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'general', label: 'General', hint: 'Jornada, avisos y qué pasa al abrir una tarea' },
  { id: 'apariencia', label: 'Apariencia', hint: 'Temas, colores, tipografía, menú y colores por proyecto' },
  { id: 'ia', label: 'Chat e IA', hint: 'Claude, Copilot, permisos de comandos y contexto' },
  { id: 'integraciones', label: 'Integraciones', hint: 'Redmine, git, Telegram, Spotify y calendario' },
  { id: 'sistema', label: 'Sistema', hint: 'Terminal, bandeja e inicio con Windows' },
  { id: 'datos', label: 'Tus datos', hint: 'Exportar, importar y copias de seguridad' }
]

// Fuera del componente: al cambiar de pantalla lo escrito sin guardar se conserva hasta guardar o descartar.
let draft: Settings | null = null
let lastTab: Tab = 'general'

/** Deja elegida la pestaña que se mostrará al abrir Ajustes. */
export function showSettingsTab(t: Tab): void {
  lastTab = t
}

const wide = { gridColumn: 'span 2' } as const
const checkRow = { display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text)' } as const

// Iconos de línea (24x24) para el menú y las tarjetas.
const ICONS: Record<string, string> = {
  general: 'M4 6h16M4 12h16M4 18h10',
  apariencia: 'M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2s0-2.5 1.5-2.5H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3z',
  ia: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  integraciones: 'M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0V7zM12 16v5',
  sistema: 'M4 5h16v11H4zM8 20h8M12 16v4',
  datos: 'M12 4c4.4 0 8 1.1 8 2.5S16.4 9 12 9 4 7.9 4 6.5 7.6 4 12 4zM4 6.5v5C4 12.9 7.6 14 12 14s8-1.1 8-2.5v-5M4 11.5v5C4 17.9 7.6 19 12 19s8-1.1 8-2.5v-5',
  card: 'M5 5h14v14H5z M9 9h6M9 13h6'
}
function Icon({ n, size = 16 }: { n: string; size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[n] ?? ICONS.card} />
    </svg>
  )
}

/** Tarjeta de sección: icono + título + subtítulo (+ insignia) y los campos debajo. */
function Card({ icon = 'card', title, sub, badge, tone, children }: { icon?: string; title: string; sub?: string; badge?: string; tone?: 'ok' | 'warn'; children: ReactNode }): ReactNode {
  return (
    <section className="set-card">
      <header className="set-card-h">
        <span className="set-card-i">
          <Icon n={icon} />
        </span>
        <div className="grow">
          <h3>{title}</h3>
          {sub && <div className="set-card-sub">{sub}</div>}
        </div>
        {badge && <span className={'set-badge' + (tone ? ' ' + tone : '')}>{badge}</span>}
      </header>
      <div className="set-card-b">{children}</div>
    </section>
  )
}

/** Selector segmentado (sustituye a un desplegable corto). */
function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<[T, string]>; label: string }): ReactNode {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  )
}

/** Interruptor con su texto; es un checkbox real (accesible con teclado). */
function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }): ReactNode {
  return (
    <label className="tgl">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="tgl-s" aria-hidden="true" />
      <span>{children}</span>
    </label>
  )
}

/** Lista de comandos (uno por línea en el ajuste) como chips con × y campo para añadir con Enter. */
function CommandChips({ value, onChange, tone }: { value: string; onChange: (v: string) => void; tone?: 'danger' }): ReactNode {
  const [txt, setTxt] = useState('')
  const items = value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
  const add = (): void => {
    const t = txt.trim()
    if (t && !items.includes(t)) onChange([...items, t].join('\n'))
    setTxt('')
  }
  return (
    <div className="chips">
      {items.map((c) => (
        <span key={c} className={'chip' + (tone ? ' ' + tone : '')}>
          <code>{c}</code>
          <button type="button" aria-label={`Quitar ${c}`} onClick={() => onChange(items.filter((x) => x !== c).join('\n'))}>
            ×
          </button>
        </span>
      ))}
      <input
        className="chip-in"
        value={txt}
        placeholder="+ añadir comando y Enter"
        onChange={(e) => setTxt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          }
        }}
        onBlur={add}
      />
    </div>
  )
}

/** Reinicio manual: cierra la app y la vuelve a abrir para cargar los cambios nuevos. Avisa si hay respuestas en curso. */
function RestartApp(): ReactNode {
  const db = useDB()
  const ui = useUi()
  const busy = Object.values(db.chats).some((c) => c.running)
  const restart = async (): Promise<void> => {
    const ok = await ui.confirm(
      (busy ? 'Hay respuestas en curso: se cortarán. ' : '') + 'La app se cerrará y volverá a abrirse con los cambios más recientes. Tus tareas, horas y conversaciones se conservan.',
      { title: 'Reiniciar la aplicación', confirmLabel: 'Reiniciar', danger: busy }
    )
    if (ok) void ui.run('app:restart')
  }
  return (
    <div className="upd-card">
      <div className="upd-row">
        <div className="grow">
          <b>Reiniciar la aplicación</b>
          <div className="meta">Cierra y vuelve a abrir la app para cargar los cambios nuevos.</div>
        </div>
        <button className="btn sm" onClick={() => void restart()}>
          Reiniciar
        </button>
      </div>
    </div>
  )
}

export function SettingsView(): ReactNode {
  const db = useDB()
  const ui = useUi()
  const [s, setS] = useState<Settings>(draft ?? db.settings)
  const [tab, setTabS] = useState<Tab>(lastTab)
  const setTab = (t: Tab): void => {
    lastTab = t
    setTabS(t)
  }
  const set = <K extends keyof Settings>(k: K, v: Settings[K]): void =>
    setS((p) => {
      const n = { ...p, [k]: v }
      draft = n
      return n
    })

  // la apariencia se guarda sola y cambia en los datos aparte: no cuenta como cambio pendiente
  const plain = (x: Settings): string => JSON.stringify({ ...x, appearance: undefined })
  const dirty = draft !== null && plain(draft) !== plain(db.settings)
  const changed = dirty && draft
    ? (Object.keys(draft) as Array<keyof Settings>).filter((k) => k !== 'appearance' && JSON.stringify(draft![k]) !== JSON.stringify(db.settings[k])).length
    : 0

  const save = async (): Promise<void> => {
    await ui.run('settings:save', {
      targetHours: Number(s.targetHours) || 8,
      reminderTime: s.reminderTime || '17:30',
      idleMinutes: Number(s.idleMinutes) || 0,
      openMode: s.openMode,
      summaryMode: s.summaryMode,
      claudeCmd: s.claudeCmd.trim() || 'claude',
      whisperCmd: (s.whisperCmd || '').trim(),
      whisperModel: (s.whisperModel || '').trim(),
      whisperLang: (s.whisperLang || '').trim() || 'es',
      meetingKeepAudio: !!s.meetingKeepAudio,
      myNames: (s.myNames || '').trim(),
      meetingAutoTasks: !!s.meetingAutoTasks,
      copilotCmd: s.copilotCmd.trim() || 'copilot',
      geminiCmd: s.geminiCmd.trim() || 'gemini',
      copilotQuota: Math.max(0, Math.round(Number(s.copilotQuota) || 0)),
      copilotModels: s.copilotModels,
      allowedCommands: s.allowedCommands,
      commandPolicy: s.commandPolicy,
      gitAuthor: (s.gitAuthor || '').trim(),
      promptTemplate: s.promptTemplate,
      promptTemplates: s.promptTemplates,
      defaultContext: s.defaultContext ?? DEFAULT_CONTEXT,
      reviewInstructions: (s.reviewInstructions || '').trim(),
      autoSessionNotes: s.autoSessionNotes !== false,
      githubToken: (s.githubToken || '').trim(),
      baseBranch: (s.baseBranch || '').trim(),
      autoUpdate: s.autoUpdate !== false,
      autocompactTokens: Number(s.autocompactTokens) >= 100_000 ? Math.min(1_000_000, Math.round(Number(s.autocompactTokens))) : 0,
      defaultChatModel: (s.defaultChatModel || '').trim(),
      contextWarnTokens: Math.max(10_000, Number(s.contextWarnTokens) || 100_000),
      contextCriticalTokens: Math.max(20_000, Number(s.contextCriticalTokens) || 160_000),
      notifyOnDone: s.notifyOnDone,
      terminal: s.terminal,
      terminalMode: s.terminalMode,
      closeToTray: s.closeToTray,
      miniEnabled: s.miniEnabled !== false,
      limitAlerts: s.limitAlerts !== false,
      prAutoReview: s.prAutoReview !== false,
      claudeWeb: s.claudeWeb !== false,
      cheapAt: s.cheapAt ?? 0,
      profiles: s.profiles,
      taskTemplates: s.taskTemplates,
      miniFormat: s.miniFormat ?? 'full',
      miniOnTop: s.miniOnTop !== false,
      miniOpacity: s.miniOpacity ?? 100,
      launchAtLogin: s.launchAtLogin,
      dailyTime: s.dailyTime || '',
      redmineUrl: s.redmineUrl.trim(),
      redmineActivity: s.redmineActivity.trim() || 'Work (Office)'
    })
    draft = null
    ui.toast('Ajustes guardados')
  }

  const discard = (): void => {
    draft = null
    setS(db.settings)
  }

  const cur = TABS.find((t) => t.id === tab)!

  return (
    <>
      <h1>Ajustes</h1>
      <div className="settings">
        <nav className="settings-nav" aria-label="Secciones de ajustes">
          <div className="settings-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
                <Icon n={t.id} />
                {t.label}
              </button>
            ))}
          </div>
          <div className="settings-foot">Todo se guarda localmente</div>
        </nav>
        <div className="settings-body">
          <h2 className="settings-title">{cur.label}</h2>
          <div className="settings-hint">{cur.hint}</div>

          {tab === 'apariencia' && <AppearanceSettings />}

          {tab === 'general' && (
            <>
            <Card icon="general" title="Jornada y avisos" sub="Horas objetivo, inactividad y recordatorios">
            <div className="grid2">
              <div>
                <label>Horas objetivo por día (también el tope a imputar en Redmine)</label>
                <input type="number" step="0.5" value={s.targetHours} onChange={(e) => set('targetHours', e.target.valueAsNumber)} />
              </div>
              <div>
                <label>Pausar timer tras X min inactivo (0 = nunca)</label>
                <input type="number" value={s.idleMinutes} onChange={(e) => set('idleMinutes', e.target.valueAsNumber)} />
              </div>
              <div>
                <label>Recordatorio de cierre del día</label>
                <input type="time" value={s.reminderTime} onChange={(e) => set('reminderTime', e.target.value)} />
              </div>
              <div>
                <label>Aviso matutino del daily (vacío = sin aviso)</label>
                <input type="time" value={s.dailyTime} onChange={(e) => set('dailyTime', e.target.value)} />
              </div>
            </div>
            </Card>
            <Card icon="ia" title="Al abrir una tarea" sub="Qué se abre y cómo se resume el trabajo">
            <div className="grid2">
              <div style={wide}>
                <label>Al hacer click en una tarea abrir con…</label>
                <Select
                  value={s.openMode}
                  onChange={(v) => set('openMode', v as OpenMode)}
                  options={[
                    { value: 'chat', label: 'Chat de esta app (prompt precargado)' },
                    { value: 'desktop', label: 'Claude Desktop (carpeta y prompt precargados)' },
                    { value: 'terminal', label: 'PowerShell con el comando claude' }
                  ]}
                />
              </div>
              <div style={wide}>
                <label>Resumen automático de lo hecho en Claude (al pausar, detener o completar)</label>
                <Select
                  value={s.summaryMode}
                  onChange={(v) => set('summaryMode', v as SummaryMode)}
                  options={[
                    { value: 'ai', label: 'Con IA (usa tu Claude Code, gasta algo de uso)' },
                    { value: 'local', label: 'Local: primer pedido + archivos modificados' },
                    { value: 'off', label: 'Desactivado' }
                  ]}
                />
              </div>
              <div style={wide}>
                <Toggle checked={s.notifyOnDone} onChange={(v) => set('notifyOnDone', v)}>
                  Avisarme con una notificación cuando Claude termine (si la app no está en primer plano)
                </Toggle>
              </div>
              <div style={wide}>
                <Toggle checked={s.prAutoReview !== false} onChange={(v) => set('prAutoReview', v)}>
                  Mover la tarea a «En revisión» cuando se abra su PR (y a «Hecha» cuando se fusione)
                </Toggle>
              </div>
            </div>
            </Card>
            <Card icon="card" title="Prompt inicial" sub="Plantilla con la que arranca cada chat de tarea">
              <label>Variables: {'{{title}} {{description}} {{project}} {{client}}'}</label>
              <textarea style={{ minHeight: 160 }} value={s.promptTemplate} onChange={(e) => set('promptTemplate', e.target.value)} />
            </Card>
            </>
          )}

          {tab === 'ia' && (
            <>
            <Card
              icon="ia"
              title="Proveedores de IA"
              sub="Comandos de Claude y GitHub Copilot"
              badge={`${s.copilotModels.split(/\r?\n/).filter((x) => x.trim()).length} modelos`}
            >
            <div className="grid2">
              <div>
                <label>Comando de Claude (resumen IA y modo PowerShell)</label>
                <input value={s.claudeCmd} onChange={(e) => set('claudeCmd', e.target.value)} />
              </div>
              <div>
                <label>Comando de GitHub Copilot (CLI)</label>
                <input value={s.copilotCmd} onChange={(e) => set('copilotCmd', e.target.value)} />
              </div>
              <div>
                <label>Comando de Gemini (CLI, con GEMINI_API_KEY en el entorno)</label>
                <input value={s.geminiCmd} onChange={(e) => set('geminiCmd', e.target.value)} />
                <div className="meta">La clave no se guarda en la app: define la variable GEMINI_API_KEY en Windows (setx) y reinicia la app.</div>
              </div>
              <div>
                <label>Solicitudes premium mensuales de Copilot (0 = sin definir)</label>
                <input type="number" min={0} step={50} value={s.copilotQuota} onChange={(e) => set('copilotQuota', e.target.valueAsNumber || 0)} />
              </div>
              <div>
                <label>Modelos de Copilot en el selector (uno por línea)</label>
                <textarea style={{ minHeight: 90 }} value={s.copilotModels} onChange={(e) => set('copilotModels', e.target.value)} />
              </div>

            </div>
            </Card>
            <Card icon="datos" title="Reuniones" sub="Transcripción en tu equipo" badge={s.whisperModel?.trim() ? undefined : 'Falta modelo'} tone="warn">
            <div className="grid2">
              <div style={wide} className="meta">
                La voz se transcribe localmente con whisper.cpp: el audio no sale de tu equipo. Solo el texto se envía a Claude para redactar el resumen. Descarga whisper-cli (whisper.cpp) y un modelo ggml, por ejemplo ggml-small.bin.
              </div>
              <div>
                <label>Ejecutable de whisper.cpp (whisper-cli.exe)</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input style={{ flex: 1, minWidth: 0 }} value={s.whisperCmd} onChange={(e) => set('whisperCmd', e.target.value)} />
                  <button className="btn sm" onClick={() => void ui.run('file:pick', 'app').then((p) => p && set('whisperCmd', p))}>
                    Elegir…
                  </button>
                </div>
              </div>
              <div>
                <label>Modelo (ggml-*.bin)</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input style={{ flex: 1, minWidth: 0 }} value={s.whisperModel} onChange={(e) => set('whisperModel', e.target.value)} />
                  <button className="btn sm" onClick={() => void ui.run('file:pick', 'file').then((p) => p && set('whisperModel', p))}>
                    Elegir…
                  </button>
                </div>
              </div>
              <div>
                <label>Idioma hablado («es», «en»… o «auto»)</label>
                <input value={s.whisperLang} onChange={(e) => set('whisperLang', e.target.value)} />
              </div>
              <div>
                <Toggle checked={!!s.meetingKeepAudio} onChange={(v) => set('meetingKeepAudio', v)}>
                  Conservar el audio tras transcribir (por defecto se borra)
                </Toggle>
              </div>
              <div style={wide}>
                <label>Mis nombres en las reuniones (separados por comas)</label>
                <input value={s.myNames} placeholder="Ej.: Martín, Martin Escobedo, Marto" onChange={(e) => set('myNames', e.target.value)} />
                <div className="meta">Con estos nombres se detecta qué tareas de una reunión son tuyas. Si lo dejas vacío se usan las partes de tu correo de inicio de sesión.</div>
              </div>
              <div style={wide}>
                <Toggle checked={!!s.meetingAutoTasks} onChange={(v) => set('meetingAutoTasks', v)}>
                  Proponer tareas al terminar el resumen (nunca se crean sin que las confirmes)
                </Toggle>
              </div>
            </div>
            </Card>

            <Card icon="sistema" title="Permisos de comandos" sub="Qué pueden ejecutar Claude y Copilot sin preguntar">
              <label>Comandos fuera de la lista</label>
              <Segmented<CommandPolicy>
                label="Política de comandos"
                value={s.commandPolicy}
                onChange={(v) => set('commandPolicy', v)}
                options={[
                  ['all', 'Permitir todos salvo bloqueados'],
                  ['ask', 'Preguntar siempre'],
                  ['list', 'Solo la lista']
                ]}
              />
              <div className="meta">Preguntar solo aplica a Claude; Copilot usa «solo la lista».</div>
              <label style={{ marginTop: 12 }}>Comandos permitidos sin preguntar</label>
              <CommandChips value={s.allowedCommands} onChange={(v) => set('allowedCommands', v)} />
              <div className="meta">Se permite el comando y sus argumentos.</div>
              <div className="set-danger" role="note">
                Siempre se bloquean push forzado, reset --hard, borrados y comandos similares, aunque estén en la lista.
              </div>
              <div style={{ marginTop: 12 }}>
                <Toggle checked={s.claudeWeb !== false} onChange={(v) => set('claudeWeb', v)}>
                  Permitir que Claude consulte páginas web (WebFetch y WebSearch) en los chats
                </Toggle>
                <div className="meta">El contenido de una página es externo y podría intentar darle órdenes: desactívalo si trabajas con sitios que no controlas.</div>
              </div>
            </Card>

            <Card icon="card" title="Plantillas de prompts" sub="Los marcados con ★ salen como botones; búscalos con # en el chat">
            <div className="grid2">
              <div style={wide}>
                <div className="meta" style={{ marginBottom: 8 }}>
                  Prompts que no tienes que volver a escribir. Los marcados con ★ salen como botones sobre el cuadro de texto; todos se buscan escribiendo # en el chat.
                </div>
                <TemplatesEditor value={templatesOf(s)} onChange={(t) => set('promptTemplates', t)} />
              </div>

            </div>
            </Card>
            <Card icon="ia" title="Perfiles de agente" sub="Modo, modelo e instrucciones guardados con nombre">
            <div className="grid2">
              <div style={wide}>
                <div className="meta" style={{ marginBottom: 8 }}>
                  Modo, modelo, instrucciones y solo lectura guardados con nombre (por ejemplo «Revisor» o «Tests»). Se eligen en el chat.
                </div>
                <ProfilesEditor value={profilesOf(s)} onChange={(p) => set('profiles', p)} />
              </div>

            </div>
            </Card>
            <Card icon="integraciones" title="Skills" sub="Capacidades extra de Claude">
            <div className="grid2">
              <div style={wide}>
                <div className="meta" style={{ marginBottom: 8 }}>
                  Capacidades extra de Claude publicadas por Anthropic (documentos, diseño, pruebas…). Se administran en una ventana aparte.
                </div>
                <button className="btn" onClick={() => void window.api.call('window:skills')}>
                  Abrir catálogo de skills
                </button>
              </div>

            </div>
            </Card>
            <Card icon="card" title="Tareas tipo" sub="Plantillas que rellenan una tarea nueva">
            <div className="grid2">
              <div style={wide}>
                <div className="meta" style={{ marginBottom: 8 }}>
                  Plantillas de tarea (bug, funcionalidad, hotfix…) que rellenan título, descripción, prioridad y subtareas al crear una tarea nueva.
                </div>
                <TaskTemplatesEditor value={taskTemplatesOf(s)} onChange={(t) => set('taskTemplates', t)} />
              </div>

            </div>
            </Card>
            <Card icon="datos" title="Límites de la cuenta" sub="Avisos de uso y modelo económico">
            <div className="grid2">
              <div style={wide}>
                <Toggle checked={s.limitAlerts !== false} onChange={(v) => set('limitAlerts', v)}>
                  Avisar al llegar al 80 % y al 95 % de la sesión de 5 horas o de la semana
                </Toggle>
                <label style={{ ...checkRow, alignItems: 'center' }}>
                  Usar el modelo más barato desde
                  <select style={{ width: 'auto' }} value={s.cheapAt ?? 0} onChange={(e) => set('cheapAt', Number(e.target.value))}>
                    <option value={0}>nunca (solo ofrecerlo en el chat)</option>
                    <option value={70}>70 % de uso</option>
                    <option value={80}>80 % de uso</option>
                    <option value={90}>90 % de uso</option>
                    <option value={95}>95 % de uso</option>
                  </select>
                </label>
                <div className="meta">Con Claude el más barato es haiku; con Copilot, el modelo «mini» o «flash» de tu lista. Lo informa Claude Code, así que solo hay datos tras la primera respuesta.</div>
              </div>

            </div>
            </Card>
            <Card icon="ia" title="Contexto automático" sub="Qué se anexa al primer mensaje de cada conversación">
            <div className="grid2">
              <div style={wide}>
                <label>Se anexa al primer mensaje de cada conversación nueva (después se elige mensaje a mensaje)</label>
                <div className="ctxbar" style={{ padding: 0 }}>
                  {ALL_CONTEXT.map((k) => {
                    const on = (s.defaultContext ?? DEFAULT_CONTEXT).includes(k)
                    return (
                      <button key={k} type="button" className={`ctx-chip ${on ? 'on' : ''}`} title={CONTEXT_HINT[k]} aria-pressed={on} onClick={() => set('defaultContext', on ? (s.defaultContext ?? DEFAULT_CONTEXT).filter((x) => x !== k) : [...(s.defaultContext ?? DEFAULT_CONTEXT), k])}>
                        {CONTEXT_LABEL[k]}
                      </button>
                    )
                  })}
                </div>
                <div className="meta">Los diffs pesan mucho (se ven los caracteres en «Ver lo que se envía»): conviene dejarlos para cuando los necesites.</div>
              </div>
              <div style={wide}>
                <Toggle checked={s.autoSessionNotes !== false} onChange={(v) => set('autoSessionNotes', v)}>
                  Guardar una nota de sesión sola al cerrar una conversación (usa tu Claude Code; queda en la tarea y se anexa al retomarla)
                </Toggle>
              </div>
            </div>
            </Card>
            <Card icon="card" title="Revisión de código" sub="Indicaciones propias de tu equipo">
            <div className="grid2">
              <div style={wide}>
                <label>Indicaciones propias de tu equipo (se agregan a la revisión estándar)</label>
                <textarea
                  style={{ minHeight: 90 }}
                  value={s.reviewInstructions || ''}
                  placeholder={'Ej.: Usamos Clean Architecture; los servicios no acceden a la base de datos directamente.\nTodo endpoint nuevo necesita test de integración.\nNo se aceptan console.log ni TODO sin issue.'}
                  onChange={(e) => set('reviewInstructions', e.target.value)}
                />
                <div className="meta">La revisión es de solo lectura: lee el diff contra la rama base, simula escenarios y entrega hallazgos con gravedad y un veredicto.</div>
              </div>

            </div>
            </Card>
            <Card icon="datos" title="Contexto de los chats" sub="Compactación automática">
            <div className="grid2">
              <div style={wide}>
                <label>Compactación automática (miles de tokens; 0 = la decide Claude Code; mínimo 100)</label>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={Math.round((s.autocompactTokens || 0) / 1000)}
                  onChange={(e) => set('autocompactTokens', (e.target.valueAsNumber || 0) * 1000)}
                />
                <div className="meta">Recomendado: 150. Un chat largo vuelve a procesar toda la conversación en cada paso, y es lo que más consume.</div>
              </div>
              <div style={wide}>
                <label>Modelo de los chats nuevos</label>
                <Select
                  ariaLabel="Modelo de los chats nuevos"
                  value={s.defaultChatModel ?? ''}
                  onChange={(v) => set('defaultChatModel', v)}
                  options={[
                    { value: '', label: 'El que use Claude Code (por defecto)' },
                    { value: 'haiku', label: 'Haiku: el más barato, para cambios simples' },
                    { value: 'sonnet', label: 'Sonnet: equilibrado' },
                    { value: 'opus', label: 'Opus: el más potente y caro' }
                  ]}
                />
                <div className="meta">Cada chat puede cambiarlo desde su selector de modelo. Las tareas de fondo (resúmenes, mensajes de commit) usan Haiku automáticamente.</div>
              </div>
              <div>
                <label>Recomendar compactar desde (miles de tokens)</label>
                <input type="number" min={10} step={10} value={Math.round(s.contextWarnTokens / 1000)} onChange={(e) => set('contextWarnTokens', (e.target.valueAsNumber || 0) * 1000)} />
              </div>
              <div>
                <label>Avisar como crítico desde (miles de tokens)</label>
                <input
                  type="number"
                  min={20}
                  step={10}
                  value={Math.round(s.contextCriticalTokens / 1000)}
                  onChange={(e) => set('contextCriticalTokens', (e.target.valueAsNumber || 0) * 1000)}
                />
              </div>
            </div>
            </Card>
            </>
          )}

          {tab === 'integraciones' && (
            <>
              <Card icon="integraciones" title="Redmine" sub="Dirección y actividad por defecto">
              <div className="grid2">
                <div>
                  <label>Dirección de Redmine</label>
                  <input value={s.redmineUrl} placeholder="https://redmine.tuempresa.com" onChange={(e) => set('redmineUrl', e.target.value)} />
                </div>
                <div>
                  <label>Actividad por defecto</label>
                  <Select
                    ariaLabel="Actividad de Redmine"
                    value={s.redmineActivity}
                    onChange={(v) => set('redmineActivity', v)}
                    creatable
                    options={['Work (On customer)', 'Work (Remote)', 'Work (Office)', 'Travel'].map((v) => ({ value: v, label: v }))}
                  />
                </div>
              </div>
              </Card>
              <Card icon="integraciones" title="Git y GitHub" sub="Autor, rama base y token">
              <div className="grid2">
                <div>
                  <label>Autor git para commits del día (vacío = todos)</label>
                  <input value={s.gitAuthor || ''} placeholder="tu@correo.com" onChange={(e) => set('gitAuthor', e.target.value)} />
                </div>
                <div>
                  <label>Rama base de los PR si no se detecta (vacío = main)</label>
                  <input value={s.baseBranch || ''} placeholder="main" onChange={(e) => set('baseBranch', e.target.value)} />
                </div>
                <div style={wide}>
                  <label>Token de GitHub para issues y PR (opcional)</label>
                  <input type="password" autoComplete="off" value={s.githubToken || ''} placeholder="Vacío = usar la sesión de Git (Administrador de credenciales)" onChange={(e) => set('githubToken', e.target.value)} />
                  <div className="meta">
                    Crear y listar issues y comprobar si un PR ya existe usan la API de GitHub. Si ya haces push desde esta máquina no necesitas token. Si lo pones, que tenga permiso sobre Issues y Pull requests (o «repo»). Se guarda solo en este equipo.
                  </div>
                </div>
              </div>
              </Card>
              <div className="meta" style={{ marginTop: 14 }}>
                Redmine y git se guardan con el botón «Guardar» de abajo; Telegram tiene el suyo.
              </div>
              <TelegramSettings />
              <SpotifySettings />
              <CalendarSettings />
            </>
          )}

          {tab === 'sistema' && (
            <>
            <AccountSettings />
            <Card icon="sistema" title="Terminal" sub="Dónde y con qué se abre">
            <div className="grid2">
              <div>
                <label>Dónde se abre la terminal de una tarea</label>
                <Select
                  value={s.terminalMode}
                  onChange={(v) => set('terminalMode', v as TerminalMode)}
                  options={[
                    { value: 'integrated', label: 'Integrada en la app, como VS Code (Ctrl+`)' },
                    { value: 'external', label: 'Ventana aparte' }
                  ]}
                />
              </div>
              <div>
                <label>Terminal: shell integrado y programa de la ventana aparte</label>
                <Select
                  value={s.terminal}
                  onChange={(v) => set('terminal', v as TerminalKind)}
                  options={[
                    { value: 'auto', label: 'Automática (Windows Terminal si está instalado)' },
                    { value: 'wt', label: 'Windows Terminal' },
                    { value: 'powershell', label: 'PowerShell' },
                    { value: 'cmd', label: 'Símbolo del sistema (cmd)' }
                  ]}
                />
              </div>
            </div>
            </Card>
            <Card icon="sistema" title="Actualizaciones y ventana" sub="Versiones, bandeja e inicio">
            <div className="grid2">
              <div style={wide}>
                <UpdateCard />
                <label style={checkRow}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={s.autoUpdate !== false} onChange={(e) => set('autoUpdate', e.target.checked)} />
                  Buscar y descargar versiones nuevas automáticamente (al abrir y cada 4 horas)
                </label>
                <div style={{ marginTop: 10 }}>
                  <RestartApp />
                </div>
              </div>
              <div style={wide}>
                <label style={checkRow}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={s.closeToTray} onChange={(e) => set('closeToTray', e.target.checked)} />
                  Al cerrar la ventana, seguir en la bandeja del sistema (el timer y los avisos siguen activos)
                </label>
                <label style={checkRow}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={s.miniEnabled !== false} onChange={(e) => set('miniEnabled', e.target.checked)} />
                  Mostrar la ventana flotante al minimizar la principal
                </label>
                {s.miniEnabled !== false && (
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', margin: '4px 0 8px 26px', flexWrap: 'wrap' }}>
                    <select style={{ width: 'auto' }} value={s.miniFormat ?? 'full'} onChange={(e) => set('miniFormat', e.target.value as MiniFormat)}>
                      <option value="full">Completa: conversación, timer y chat</option>
                      <option value="compact">Compacta: conversación y timer</option>
                      <option value="timer">Mínima: solo timer</option>
                    </select>
                    <label style={{ ...checkRow, margin: 0 }}>
                      <input type="checkbox" style={{ width: 'auto' }} checked={s.miniOnTop !== false} onChange={(e) => set('miniOnTop', e.target.checked)} />
                      Siempre por encima de otras ventanas
                    </label>
                    <label style={{ ...checkRow, margin: 0 }}>
                      Opacidad · {s.miniOpacity ?? 100}%
                      <input type="range" style={{ width: 120 }} min={40} max={100} step={5} value={s.miniOpacity ?? 100} onChange={(e) => set('miniOpacity', Number(e.target.value))} />
                    </label>
                  </div>
                )}
                <label style={checkRow}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={s.launchAtLogin} onChange={(e) => set('launchAtLogin', e.target.checked)} />
                  Iniciar con Windows (arranca en la bandeja)
                </label>
              </div>
            </div>
            </Card>
            </>
          )}

          {tab === 'datos' && (
            <>
              <div className="meta" style={{ marginBottom: 8 }}>
                Todo vive en tu equipo. Se hace una copia automática cada día; aquí puedes llevarte los datos a otro equipo o recuperar una copia anterior.
              </div>
              <div className="foot" style={{ marginTop: 0 }}>
                <button className="btn" onClick={() => void ui.run('data:export').then((p) => p && ui.toast(`Datos exportados: ${p}`))}>
                  Exportar datos…
                </button>
                <button
                  className="btn"
                  onClick={async () => {
                    const ok = await ui.confirm('Importar reemplaza TODAS las tareas, horas y conversaciones actuales por las del archivo. Antes se guarda una copia de lo actual.', {
                      title: 'Importar datos',
                      confirmLabel: 'Importar',
                      danger: true
                    })
                    if (ok) void ui.run('data:import').then((done) => done && ui.toast('Datos importados'))
                  }}
                >
                  Importar datos…
                </button>
                <button className="btn" onClick={() => void ui.run('data:backups')}>
                  Abrir carpeta de copias
                </button>
              </div>
            </>
          )}

          {tab !== 'datos' && tab !== 'apariencia' && (
            <div className={'settings-bar' + (dirty ? ' dirty' : '')} role="region" aria-label="Guardar ajustes">
              <span className="settings-bar-t">
                {dirty ? (
                  <>
                    <i className="dot" /> Cambios sin guardar · {changed} {changed === 1 ? 'campo modificado' : 'campos modificados'}
                  </>
                ) : (
                  'Sin cambios pendientes'
                )}
              </span>
              <span className="grow" />
              <button className="btn" onClick={discard} disabled={!dirty}>
                Descartar
              </button>
              <button className="btn primary" onClick={save} disabled={!dirty}>
                Guardar
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
