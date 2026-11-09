import { app, Menu, session, type MenuItemConstructorOptions, type WebContents } from 'electron'

const MAX_SUGGESTIONS = 5

/** Menú contextual de las ventanas de la app: sugerencias del corrector ortográfico y acciones de edición. */
function attach(wc: WebContents): void {
  wc.on('context-menu', (_e, params) => {
    const word = params.misspelledWord
    if (!params.isEditable && !params.selectionText) return
    const items: MenuItemConstructorOptions[] = []
    if (params.isEditable && word) {
      const suggestions = params.dictionarySuggestions.slice(0, MAX_SUGGESTIONS)
      if (suggestions.length) {
        for (const s of suggestions) items.push({ label: s, click: () => wc.replaceMisspelling(s) })
      } else {
        items.push({ label: 'Sin sugerencias', enabled: false })
      }
      items.push(
        { type: 'separator' },
        { label: 'Añadir al diccionario', click: () => wc.session.addWordToSpellCheckerDictionary(word) },
        { type: 'separator' }
      )
    }
    if (params.isEditable) {
      items.push(
        { label: 'Deshacer', role: 'undo', enabled: params.editFlags.canUndo },
        { label: 'Rehacer', role: 'redo', enabled: params.editFlags.canRedo },
        { type: 'separator' },
        { label: 'Cortar', role: 'cut', enabled: params.editFlags.canCut },
        { label: 'Copiar', role: 'copy', enabled: params.editFlags.canCopy },
        { label: 'Pegar', role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { label: 'Seleccionar todo', role: 'selectAll' }
      )
    } else {
      items.push({ label: 'Copiar', role: 'copy' })
    }
    Menu.buildFromTemplate(items).popup()
  })
}

/** Registra el menú en las ventanas propias (los <webview> de sitios externos conservan su comportamiento) y fija los idiomas del corrector. */
export function initContextMenu(): void {
  const langs = session.defaultSession.availableSpellCheckerLanguages
  const wanted = ['es', 'es-ES', 'es-MX', 'en-US'].filter((l) => langs.includes(l))
  if (wanted.length) session.defaultSession.setSpellCheckerLanguages(wanted)
  app.on('web-contents-created', (_e, contents) => {
    if (contents.getType() === 'window') attach(contents)
  })
}
