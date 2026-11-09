import { contextBridge, ipcRenderer, webFrame } from 'electron'

/**
 * Preload de la ventana de WhatsApp Web. Es distinto del de la app: la página de WhatsApp no tiene acceso a window.api.
 * Solo expone un canal para enviar un aviso (título y texto) a la app.
 */
contextBridge.exposeInMainWorld('__shutokiWsp', {
  notify: (title: string, body: string): void => {
    ipcRenderer.send('wsp:notify', title, body)
  }
})

// Sustituye la API de notificaciones antes de que cargue WhatsApp: cada new Notification(...) se reenvía a la app.
void webFrame.executeJavaScript(`(() => {
  const send = window.__shutokiWsp && window.__shutokiWsp.notify;
  class AppNotification {
    constructor(title, options) {
      this.title = String(title ?? '');
      this.body = options && options.body ? String(options.body) : '';
      this.tag = options && options.tag ? String(options.tag) : '';
      this.onclick = null; this.onclose = null; this.onerror = null; this.onshow = null;
      if (send) send(this.title, this.body);
    }
    close() {}
    addEventListener() {}
    removeEventListener() {}
    static get permission() { return 'granted'; }
    static requestPermission(cb) { if (typeof cb === 'function') cb('granted'); return Promise.resolve('granted'); }
  }
  Object.defineProperty(window, 'Notification', { value: AppNotification, writable: true, configurable: true });
})()`)
