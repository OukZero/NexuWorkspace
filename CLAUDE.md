# Shutoki AI Workspace

App de escritorio (Electron + React 19 + TypeScript, electron-vite) para gestionar tareas con timer, horas → Excel/Redmine, chat con Claude/Copilot, Git/GitHub, notas, reuniones (whisper.cpp local), Telegram, Spotify, WhatsApp y navegador. Interfaz y mensajes en español.

## Comandos
- `npm run typecheck` — tipos de main y renderer (hazlo siempre antes de dar algo por terminado).
- `npx electron-vite build` — compila. `npm run dev` abre la app en desarrollo.
- `npm run pack` — genera `release\win-unpacked\Shutoki AI Workspace.exe` (falla con EBUSY si la app está abierta).
- No hay tests automáticos.

## Dónde está cada cosa
- `src/shared/types.ts` — **fuente de verdad**: `IpcChannels` (nombre → args/ret), `Settings`, `DB`, `Task`, `Meeting`…
- `src/main/ipc.ts` — registra cada canal con `api('canal', fn)`. Los datos viven en `getDb()`; tras cambiarlos, `commit()`.
- `src/main/db.ts` — `DEFAULT_SETTINGS`, `normalize()` (migraciones). Persistencia SQLite en `%APPDATA%\mis-tareas\shutoki.db`.
- `src/renderer/src/App.tsx` — rutas por vista (`switch (view)`); `ui.tsx` define el tipo `View`; menú en `navDefs.ts`.
- Renderer: `window.api.call('canal', …)`; en componentes `ui.run(...)` muestra el error. Estado: `useDB()` en `store.ts`.
- Ajustes: `components/SettingsView.tsx` (pestañas, borrador en memoria; añade el campo también en la lista de `save()`).
- Estilos: `renderer/src/styles/` (`cockpit.css`, `extra.css`); variables `--accent`, `--ln`, `--muted`…

### Módulos de `src/main` por tema
- Chat IA: `chat.ts` (proceso `claude -p` en stream-json, uso/tokens), `copilot.ts`, `context.ts` (contexto de la tarea), `sessions.ts` (notas de sesión), `summary.ts` (`askClaude`).
- Tiempo: `timer.ts`, `scheduler.ts`, `excel.ts`, `redmine.ts` (GraphQL desde un BrowserWindow, borradores en `db.rmDrafts`).
- Git: `git.ts`, `forge.ts` (issues/PR de GitHub), `review.ts`, `ci.ts`, `isolation.ts`.
- Otros: `meetings.ts` (grabar → whisper → resumen → tareas propuestas), `notes.ts` (protocolo `shutoki-note://`), `telegram.ts`, `calendar.ts`, `spotify.ts`, `whatsapp.ts`, `web.ts`, `auth.ts` (Cognito), `usage.ts` (límites de la cuenta).

## Convenciones
- Añadir un canal IPC: tipo en `IpcChannels` → `api(...)` en `ipc.ts` → llamada desde el renderer. Los tres a la vez.
- Los archivos fuente usan CRLF en el working copy: edita con la herramienta Edit, no con `sed`/heredocs que reescriban líneas.
- Textos de interfaz en español; comentarios breves que expliquen el porqué.
- Llamadas de fondo a Claude: `askClaude()` usa Haiku por defecto; pasa `'sonnet'` solo si la calidad lo exige. No lances llamadas periódicas a la IA.
- CSP del renderer en `src/renderer/index.html` (hay que listar ahí cualquier protocolo/origen nuevo).

## Ahorro de tokens (importante: el uso casi llega al 100 % de la ventana de 5 h)
- Consulta primero el mapa de arriba; busca con Grep/Glob antes de leer archivos enteros y lee solo el tramo necesario (`offset`/`limit`). `ipc.ts`, `types.ts`, `chat.ts` y `SettingsView.tsx` son grandes.
- Para exploraciones amplias usa el agente Explore en vez de leer muchos archivos en la conversación principal.
- Cambios simples (texto, estilos, renombrados) → modelo Haiku; funciones nuevas o depuración → Sonnet; Opus solo para diseño o bugs difíciles.
- Un chat por tarea o cambio grande: tras unos 30–40 mensajes, `/compact` o abrir uno nuevo.
- No pegues salidas largas (logs, diffs completos): resume o indica el archivo.
