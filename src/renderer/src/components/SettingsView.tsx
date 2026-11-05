import { useState } from 'react'
import type { ReactNode } from 'react'
import type { CommandPolicy, OpenMode, Settings, SummaryMode, TerminalKind, TerminalMode } from '../../../shared/types'
import { useDB } from '../store'
import { useUi } from '../ui'
import { Select } from './Select'

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
      copilotCmd: s.copilotCmd.trim() || 'copilot',
      copilotQuota: Math.max(0, Math.round(Number(s.copilotQuota) || 0)),
      copilotModels: s.copilotModels,
      allowedCommands: s.allowedCommands,
      commandPolicy: s.commandPolicy,
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
      dailyTime: s.dailyTime || '',
      redmineUrl: s.redmineUrl.trim() || 'https://redminemss.seidor.es',
      redmineActivity: s.redmineActivity.trim() || 'Work (Office)'
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
        <div style={{ gridColumn: 'span 2' }}>
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
        <div>
          <label>Comando de GitHub Copilot (CLI)</label>
          <input value={s.copilotCmd} onChange={(e) => set('copilotCmd', e.target.value)} />
        </div>
        <div>
          <label>Solicitudes premium mensuales de Copilot (0 = sin definir)</label>
          <input type="number" min={0} step={50} value={s.copilotQuota} onChange={(e) => set('copilotQuota', e.target.valueAsNumber || 0)} />
        </div>
        <div>
          <label>Modelos de Copilot en el selector (uno por línea)</label>
          <textarea style={{ minHeight: 90 }} value={s.copilotModels} onChange={(e) => set('copilotModels', e.target.value)} />
        </div>
        <div>
          <label>Comandos fuera de la lista</label>
          <Select
            ariaLabel="Política de comandos"
            value={s.commandPolicy}
            onChange={(v) => set('commandPolicy', v as CommandPolicy)}
            options={[
              { value: 'ask', label: 'Preguntar cada vez (Claude)' },
              { value: 'all', label: 'Permitir todos (salvo los bloqueados)' },
              { value: 'list', label: 'Solo los de la lista' }
            ]}
          />
          <div className="meta">Preguntar solo aplica a Claude; Copilot usa «solo la lista». Los comandos peligrosos se bloquean siempre.</div>
        </div>
        <div>
          <label>Comandos que Claude y Copilot pueden ejecutar sin preguntar (uno por línea)</label>
          <textarea style={{ minHeight: 90 }} value={s.allowedCommands} placeholder="git status&#10;npm run&#10;dotnet build" onChange={(e) => set('allowedCommands', e.target.value)} />
          <div className="meta">Se permite el comando y sus argumentos. Siempre se bloquean push forzado, reset --hard, borrados y similares.</div>
        </div>
        <div>
          <label>Dirección de Redmine</label>
          <input value={s.redmineUrl} onChange={(e) => set('redmineUrl', e.target.value)} />
        </div>
        <div>
          <label>Actividad por defecto en Redmine</label>
          <Select
            ariaLabel="Actividad de Redmine"
            value={s.redmineActivity}
            onChange={(v) => set('redmineActivity', v)}
            creatable
            options={['Work (On customer)', 'Work (Remote)', 'Work (Office)', 'Travel'].map((v) => ({ value: v, label: v }))}
          />
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
