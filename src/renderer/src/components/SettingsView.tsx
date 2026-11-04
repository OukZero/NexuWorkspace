import { useState } from 'react'
import type { ReactNode } from 'react'
import type { OpenMode, Settings, SummaryMode, TerminalKind, TerminalMode } from '../../../shared/types'
import { useDB } from '../store'
import { useUi } from '../ui'

export function SettingsView(): ReactNode {
  const db = useDB()
  const ui = useUi()
  const [s, setS] = useState<Settings>(db.settings)
  const set = <K extends keyof Settings>(k: K, v: Settings[K]): void => setS((p) => ({ ...p, [k]: v }))

  const save = async (): Promise<void> => {
    await ui.run('settings:save', {
      targetHours: Number(s.targetHours) || 8,
      reminderTime: s.reminderTime || '17:30',
      idleMinutes: Number(s.idleMinutes) || 0,
      openMode: s.openMode,
      summaryMode: s.summaryMode,
      claudeCmd: s.claudeCmd.trim() || 'claude',
      gitAuthor: (s.gitAuthor || '').trim(),
      promptTemplate: s.promptTemplate,
      autocompactTokens: Number(s.autocompactTokens) >= 100_000 ? Math.min(1_000_000, Math.round(Number(s.autocompactTokens))) : 0,
      contextWarnTokens: Math.max(10_000, Number(s.contextWarnTokens) || 100_000),
      contextCriticalTokens: Math.max(20_000, Number(s.contextCriticalTokens) || 160_000),
      notifyOnDone: s.notifyOnDone,
      terminal: s.terminal,
      terminalMode: s.terminalMode,
      closeToTray: s.closeToTray,
      launchAtLogin: s.launchAtLogin,
      dailyTime: s.dailyTime || ''
    })
    ui.toast('Ajustes guardados')
  }

  return (
    <>
      <h1>Ajustes</h1>
      <div className="sub">Todo se guarda localmente</div>
      <div className="grid2" style={{ maxWidth: 700 }}>
        <div>
          <label>Horas objetivo por día</label>
          <input type="number" step="0.5" value={s.targetHours} onChange={(e) => set('targetHours', e.target.valueAsNumber)} />
        </div>
        <div>
          <label>Recordatorio de cierre del día</label>
          <input type="time" value={s.reminderTime} onChange={(e) => set('reminderTime', e.target.value)} />
        </div>
        <div>
          <label>Aviso matutino del daily (vacío = sin aviso)</label>
          <input type="time" value={s.dailyTime} onChange={(e) => set('dailyTime', e.target.value)} />
        </div>
        <div>
          <label>Pausar timer tras X min inactivo (0 = nunca)</label>
          <input type="number" value={s.idleMinutes} onChange={(e) => set('idleMinutes', e.target.valueAsNumber)} />
        </div>
        <div>
          <label>Dónde se abre la terminal de una tarea</label>
          <select value={s.terminalMode} onChange={(e) => set('terminalMode', e.target.value as TerminalMode)}>
            <option value="integrated">Integrada en la app, como VS Code (Ctrl+`)</option>
            <option value="external">Ventana aparte</option>
          </select>
        </div>
        <div>
          <label>Terminal: shell integrado y programa de la ventana aparte</label>
          <select value={s.terminal} onChange={(e) => set('terminal', e.target.value as TerminalKind)}>
            <option value="auto">Automática (Windows Terminal si está instalado)</option>
            <option value="wt">Windows Terminal</option>
            <option value="powershell">PowerShell</option>
            <option value="cmd">Símbolo del sistema (cmd)</option>
          </select>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text)' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={s.closeToTray} onChange={(e) => set('closeToTray', e.target.checked)} />
            Al cerrar la ventana, seguir en la bandeja del sistema (el timer y los avisos siguen activos)
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text)' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={s.launchAtLogin} onChange={(e) => set('launchAtLogin', e.target.checked)} />
            Iniciar con Windows (arranca en la bandeja)
          </label>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label>Al hacer click en una tarea abrir con…</label>
          <select value={s.openMode} onChange={(e) => set('openMode', e.target.value as OpenMode)}>
            <option value="chat">Chat de esta app (prompt precargado)</option>
            <option value="desktop">Claude Desktop (carpeta y prompt precargados)</option>
            <option value="terminal">PowerShell con el comando claude</option>
          </select>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label>Resumen automático de lo hecho en Claude (al pausar, detener o completar)</label>
          <select value={s.summaryMode} onChange={(e) => set('summaryMode', e.target.value as SummaryMode)}>
            <option value="ai">Con IA (usa tu Claude Code, gasta algo de uso)</option>
            <option value="local">Local: primer pedido + archivos modificados</option>
            <option value="off">Desactivado</option>
          </select>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text)' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={s.notifyOnDone} onChange={(e) => set('notifyOnDone', e.target.checked)} />
            Avisarme con una notificación cuando Claude termine (si la app no está en primer plano)
          </label>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label>Compactación automática de los chats (miles de tokens; 0 = la decide Claude Code; mínimo 100)</label>
          <input
            type="number"
            min={0}
            step={50}
            value={Math.round((s.autocompactTokens || 0) / 1000)}
            onChange={(e) => set('autocompactTokens', (e.target.valueAsNumber || 0) * 1000)}
          />
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
        <div>
          <label>Comando de Claude (resumen IA y modo PowerShell)</label>
          <input value={s.claudeCmd} onChange={(e) => set('claudeCmd', e.target.value)} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label>Autor git para commits del día (vacío = todos)</label>
          <input value={s.gitAuthor || ''} placeholder="tu@correo.com" onChange={(e) => set('gitAuthor', e.target.value)} />
        </div>
      </div>
      <label style={{ maxWidth: 700 }}>
        Plantilla del prompt inicial de Claude · variables: {'{{title}} {{description}} {{project}} {{client}}'}
      </label>
      <textarea style={{ maxWidth: 700, minHeight: 160 }} value={s.promptTemplate} onChange={(e) => set('promptTemplate', e.target.value)} />
      <div className="foot">
        <button className="btn primary" onClick={save}>
          Guardar
        </button>
      </div>

      <h3>Tus datos</h3>
      <div className="meta" style={{ maxWidth: 700, marginBottom: 8 }}>
        Todo vive en tu equipo. Se hace una copia automática cada día; aquí puedes llevarte los datos a otro equipo o recuperar una copia anterior.
      </div>
      <div className="foot" style={{ marginTop: 0 }}>
        <button className="btn" onClick={() => void ui.run('data:export').then((p) => p && ui.toast(`Datos exportados: ${p}`))}>
          Exportar datos…
        </button>
        <button
          className="btn"
          onClick={() => {
            if (confirm('Importar reemplaza TODAS las tareas, horas y conversaciones actuales por las del archivo. Antes se guarda una copia de lo actual. ¿Continuar?'))
              void ui.run('data:import').then((ok) => ok && ui.toast('Datos importados'))
          }}
        >
          Importar datos…
        </button>
        <button className="btn" onClick={() => void ui.run('data:backups')}>
          Abrir carpeta de copias
        </button>
      </div>
    </>
  )
}
