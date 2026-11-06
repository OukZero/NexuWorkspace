# Lista de mejoras

Ideas y pendientes de Shutoki AI Workspace, sin orden estricto. Marca con `[x]` lo que se vaya haciendo.

## Ideas

- [ ] **Telegram (ida y vuelta).** Bot propio que consulta a Telegram desde el PC (sin abrir puertos) y solo obedece a tu usuario, vinculado con un código.
  - Etapa 1 (hecha, sin probar con un bot real): recibir los avisos de la campanita y pulsar Permitir / Permitir siempre / Denegar en los permisos de Claude.
  - Etapa 2 (hecha, sin probar con un bot real): mandar prompts. Elegir conversación con `/tareas`, o responder a un aviso para que vaya a esa misma conversación. Opcional: grupo con temas, un tema por tarea.
  - Etapa 3: utilidades (`/hoy`, `/pausar`, `/iniciar`, horas pendientes de imputar en Redmine).
  - Cuidado: los chats con bots no van cifrados de extremo a extremo; enviar solo títulos y resúmenes cortos, nunca código ni datos de clientes. Revisar la política de la empresa.
- [ ] Detalle por día de lo imputado en Redmine (proyecto, tarea, comentario). Falta la consulta GraphQL que lo devuelve.
- [ ] Visor de archivos: saltar a la línea del cambio desde el chat.
- [ ] Selector de hora propio (quedan `input type=time` nativos).
- [ ] Cierre de modales con clic fuera, con aviso si hay cambios sin guardar.
- [ ] Guardar el directorio de lanzamiento de cada chat para que `--resume` no falle si cambia la carpeta de trabajo.

## Sin probar de extremo a extremo

- [ ] Imputación en Redmine contra la instancia real (catálogo, envío, tope diario).
- [ ] Copilot: eventos de herramientas y sintaxis de permisos `shell(...)`.
