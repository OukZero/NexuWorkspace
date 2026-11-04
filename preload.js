const { contextBridge, ipcRenderer } = require('electron');

const call = async (name, ...args) => {
  const r = await ipcRenderer.invoke(name, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.data;
};

contextBridge.exposeInMainWorld('api', {
  call,
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onQuickAdd: (cb) => ipcRenderer.on('quickadd', cb),
  onDelta: (cb) => ipcRenderer.on('chat:delta', (_e, d) => cb(d)),
  onGoto: (cb) => ipcRenderer.on('goto', (_e, v) => cb(v)),
});
