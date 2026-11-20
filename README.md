# Nexu Workspace

Gestor local de tareas con timer, horas en Excel, imputación en Redmine y chat con Claude / Copilot / Gemini.

## Instalación (Windows)

No hace falta clonar el repositorio ni compilar nada.

1. Abre la página de [**Releases**](https://github.com/OukZero/NexuWorkspace/releases/latest).
2. En **Assets**, descarga `Nexu-Workspace-Setup-<versión>.exe`.
3. Ejecuta el instalador y sigue los pasos. Al terminar se crea el acceso directo **Nexu Workspace**.

> Windows puede mostrar «SmartScreen protegió su PC» porque el instalador no está firmado. Pulsa **Más información → Ejecutar de todas formas**.

### Actualizaciones

La app busca versiones nuevas sola (cada pocas horas) y avisa con un botón en la barra superior. Cada cambio que llega a `main` genera una Release nueva automáticamente, así que no tienes que volver a descargar nada a mano.

### Requisitos para el chat con IA

- **Claude:** tener instalado [Claude Code](https://claude.com/claude-code) e iniciada la sesión (`claude`).
- **Copilot / Gemini:** su CLI correspondiente, si quieres usar esos proveedores.

Sin ellos la app funciona igual (tareas, horas, notas, reuniones…); solo el chat con IA quedará sin responder.

### Dónde se guardan tus datos

En `%APPDATA%\mis-tareas` (base de datos `shutoki.db` y copias de seguridad diarias). Desinstalar la app no los borra.

## Desarrollo en vivo

`iniciar-dev.bat` (o `npm run live`) abre la app en modo en vivo: los cambios en `src/renderer` se ven al instante sin recargar y los de `src/main` o `src/preload` reinician la app solos. Hay que cerrar antes la app normal (usan los mismos datos). `iniciar.bat` abre la versión compilada.

Desde el código fuente: `npm ci`, `npm run dev` para desarrollar y `npm run pack` para generar el instalador en local.

## Licencia

© 2026 Martin Escobedo. Todos los derechos reservados. Software propietario: ver [LICENSE](LICENSE).
