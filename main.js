const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Notification, powerMonitor, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');
const ExcelJS = require('exceljs');
const { summarize, summarizeConversation } = require('./summary');
const { createChat } = require('./chat');

const DEFAULTS = {
  tasks: [],
  entries: [], // { id, taskId, start, end|null, note }
  settings: {
    openMode: 'chat', // 'chat' = chat de la app, 'desktop' = Claude Desktop (claude://code/new), 'terminal' = PowerShell + claude
    summaryMode: 'ai', // resumen automático al pausar/detener: 'ai' (claude -p), 'local' (sin IA) u 'off'
    claudeCmd: 'claude',
    targetHours: 8,
    reminderTime: '17:30',
    idleMinutes: 5,
    promptTemplate:
      'Trabaja en esta tarea:\n\n# {{title}}\n\n{{description}}\n\nProyecto: {{project}}\nCliente: {{client}}\n\nAntes de editar, revisa el código relevante y propón un plan breve.',
  },
  lastReminderDay: '',
  paused: null, // taskId de la tarea en pausa
  chats: {}, // taskId -> { sessionId, messages, activity, running }
};

let win, mini, dataFile, db;

// ---------- persistencia (JSON atómico) ----------
function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    db = { ...DEFAULTS, ...raw, settings: { ...DEFAULTS.settings, ...raw.settings } };
  } catch {
    db = JSON.parse(JSON.stringify(DEFAULTS));
  }
  // migración única: el chat de la app pasa a ser el modo por defecto al hacer click en una tarea
  if (!db.settings.openModeChat) { db.settings.openMode = 'chat'; db.settings.openModeChat = true; }
  // un chat no puede seguir "respondiendo" tras reiniciar la app
  for (const c of Object.values(db.chats || {})) c.running = false;
}
function save() {
  const tmp = dataFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, dataFile);
  // copia de seguridad diaria
  const bdir = path.join(path.dirname(dataFile), 'backups');
  const bfile = path.join(bdir, `data-${dayKey(new Date())}.json`);
  if (!fs.existsSync(bfile)) {
    fs.mkdirSync(bdir, { recursive: true });
    fs.copyFileSync(dataFile, bfile);
  }
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function push() {
  for (const w of [win, mini]) if (w && !w.isDestroyed()) w.webContents.send('state', db);
}
function commit() {
  save();
  push();
}

// ---------- recurrencia ----------
// Una tarea con recurrence != none es plantilla. Cada día genera una copia para hoy.
function generateRecurring() {
  const today = new Date();
  const key = dayKey(today);
  const dow = today.getDay(); // 0 dom
  let changed = false;
  for (const t of db.tasks) {
    const r = t.recurrence;
    if (!r || r.type === 'none' || t.archived) continue;
    if (t.lastGenerated === key) continue;
    const ok =
      r.type === 'daily' ||
      (r.type === 'weekdays' && dow >= 1 && dow <= 5) ||
      (r.type === 'weekly' && (r.days || []).includes(dow));
    t.lastGenerated = key;
    changed = true;
    if (!ok) continue;
    // si la copia anterior sigue abierta, se arrastra a hoy en vez de duplicarla
    const open = db.tasks.find((x) => x.fromTemplate === t.id && x.status !== 'done');
    if (open) {
      if (open.status !== 'doing') open.status = 'today';
      open.carried = (open.carried || 0) + 1;
      continue;
    }
    db.tasks.push({
      id: uid(),
      title: t.title,
      description: t.description,
      project: t.project,
      client: t.client,
      folder: t.folder,
      priority: t.priority,
      estimateMin: t.estimateMin,
      status: 'today',
      recurrence: { type: 'none' },
      fromTemplate: t.id,
      createdAt: Date.now(),
      doneAt: null,
    });
  }
  if (changed) commit();
}

// ---------- timer ----------
function activeEntry() {
  return db.entries.find((e) => !e.end);
}
function stopActive(at = Date.now()) {
  const e = activeEntry();
  if (!e) return;
  e.end = Math.max(e.start, at);
  queueSummary(e.id);
}

// Al cerrar un tramo (pausa, stop, completar, cambio de tarea) resume en segundo plano lo hecho en Claude
function queueSummary(entryId) {
  setTimeout(async () => {
    try {
      const e = db.entries.find((x) => x.id === entryId);
      const t = e && db.tasks.find((x) => x.id === e.taskId);
      if (!e || !e.end || !t || !t.folder || e.end - e.start < 120000) return;
      const r = await summarize({ folder: t.folder, from: e.start, to: e.end, mode: db.settings.summaryMode, claudeCmd: db.settings.claudeCmd });
      if (!r) return;
      if (!e.note) e.note = r.text;
      (t.log = t.log || []).push({ ts: e.end, entryId, text: r.text, mode: r.mode });
      commit();
    } catch { /* el resumen nunca debe romper el timer */ }
  }, 2000);
}
function startTimer(taskId) {
  stopActive();
  db.paused = null;
  db.entries.push({ id: uid(), taskId, start: Date.now(), end: null, note: '' });
  const t = db.tasks.find((x) => x.id === taskId);
  if (t && (t.status === 'today' || t.status === 'next')) t.status = 'doing';
}

let idleNotified = false;
function checkIdle() {
  const e = activeEntry();
  if (!e) return (idleNotified = false);
  const idleSec = powerMonitor.getSystemIdleTime();
  const limit = db.settings.idleMinutes * 60;
  if (limit > 0 && idleSec >= limit && !idleNotified) {
    // detenemos el timer descontando el tiempo inactivo
    stopActive(Date.now() - idleSec * 1000);
    db.paused = e.taskId;
    idleNotified = true;
    commit();
    new Notification({
      title: 'Timer pausado por inactividad',
      body: `Descontamos ${Math.round(idleSec / 60)} min. Reanúdalo cuando vuelvas.`,
    }).show();
  }
  if (idleSec < 10) idleNotified = false;
}

function minutesToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  let ms = 0;
  for (const e of db.entries) {
    const end = e.end || Date.now();
    const s = Math.max(e.start, start.getTime());
    if (end > s) ms += end - s;
  }
  return ms / 60000;
}

function checkReminder() {
  const now = new Date();
  const key = dayKey(now);
  const [h, m] = db.settings.reminderTime.split(':').map(Number);
  const reached = now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
  if (!reached || db.lastReminderDay === key) return;
  const dow = now.getDay();
  if (dow === 0 || dow === 6) return;
  db.lastReminderDay = key;
  save();
  const hours = minutesToday() / 60;
  const pending = db.tasks.filter((t) => t.status === 'today' || t.status === 'doing').length;
  const missing = db.settings.targetHours - hours;
  const n = new Notification({
    title: 'Cierre del día',
    body:
      (missing > 0
        ? `Llevas ${hours.toFixed(1)} h de ${db.settings.targetHours} h: te faltan ${missing.toFixed(1)} h por registrar.`
        : `Objetivo cumplido: ${hours.toFixed(1)} h registradas.`) +
      ` ${pending} tareas pendientes hoy. Abre el borrador del día para revisarlo.`,
  });
  n.on('click', () => {
    showWin();
    win.webContents.send('goto', 'hours');
  });
  n.show();
}

// ---------- abrir Claude / VS Code ----------
function renderPrompt(t) {
  return db.settings.promptTemplate
    .replace(/{{title}}/g, t.title || '')
    .replace(/{{description}}/g, t.description || '')
    .replace(/{{project}}/g, t.project || '')
    .replace(/{{client}}/g, t.client || '')
    .trim();
}
function openClaude(task) {
  if (!task.folder || !fs.existsSync(task.folder)) {
    throw new Error('La carpeta del proyecto no existe: ' + (task.folder || '(vacía)'));
  }
  if (db.settings.openMode !== 'terminal') {
    // Claude Desktop (pestaña Code): precarga carpeta y prompt; hay que confirmar la carpeta y enviar
    const url = `claude://code/new?folder=${encodeURIComponent(task.folder)}&q=${encodeURIComponent(renderPrompt(task).slice(0, 13000))}`;
    return shell.openExternal(url);
  }
  const dir = path.join(os.tmpdir(), 'mis-tareas');
  fs.mkdirSync(dir, { recursive: true });
  const pfile = path.join(dir, `prompt-${task.id}.txt`);
  fs.writeFileSync(pfile, renderPrompt(task), 'utf8');
  const q = (s) => s.replace(/'/g, "''");
  const script =
    `Set-Location -LiteralPath '${q(task.folder)}'; ` +
    `$Host.UI.RawUI.WindowTitle = '${q(task.title)}'; ` +
    `$p = Get-Content -Raw -Encoding UTF8 -LiteralPath '${q(pfile)}'; ` +
    `& ${db.settings.claudeCmd} $p`;
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  spawn('cmd.exe', ['/c', 'start', '', 'powershell.exe', '-NoExit', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64], {
    cwd: task.folder,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
}
function openVSCode(folder) {
  if (!folder || !fs.existsSync(folder)) throw new Error('La carpeta no existe');
  spawn('cmd.exe', ['/c', 'code', folder], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

// ---------- git: commits del día ----------
function gitCommits(folder, day) {
  return new Promise((resolve) => {
    if (!folder || !fs.existsSync(path.join(folder, '.git'))) return resolve([]);
    execFile(
      'git',
      ['log', '--all', '--no-merges', `--since=${day} 00:00`, `--until=${day} 23:59:59`, '--author=' + (db.settings.gitAuthor || ''), '--pretty=format:%s'],
      { cwd: folder, timeout: 8000 },
      (err, out) => resolve(err ? [] : out.split('\n').filter(Boolean))
    );
  });
}

// ---------- exportar Excel ----------
async function exportExcel(from, to) {
  const rows = [];
  const f = new Date(from + 'T00:00:00').getTime();
  const t = new Date(to + 'T23:59:59').getTime();
  for (const e of db.entries) {
    if (!e.end || e.start < f || e.start > t) continue;
    const task = db.tasks.find((x) => x.id === e.taskId);
    if (!task) continue;
    rows.push({
      day: dayKey(new Date(e.start)),
      client: task.client || '',
      project: task.project || '',
      title: task.title,
      note: e.note || '',
      hours: Math.round(((e.end - e.start) / 3600000) * 100) / 100,
    });
  }
  // agrupar por día + tarea
  const grouped = new Map();
  for (const r of rows) {
    const k = r.day + '|' + r.client + '|' + r.project + '|' + r.title;
    const g = grouped.get(k) || { ...r, hours: 0, notes: [] };
    g.hours += r.hours;
    if (r.note) g.notes.push(r.note);
    grouped.set(k, g);
  }
  const list = [...grouped.values()].sort((a, b) => a.day.localeCompare(b.day));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Horas');
  ws.columns = [
    { header: 'Fecha', key: 'day', width: 12 },
    { header: 'Cliente', key: 'client', width: 22 },
    { header: 'Proyecto', key: 'project', width: 24 },
    { header: 'Tarea', key: 'title', width: 44 },
    { header: 'Descripción', key: 'desc', width: 50 },
    { header: 'Horas', key: 'hours', width: 9 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const g of list) {
    ws.addRow({ ...g, desc: g.notes.join('; '), hours: Math.round(g.hours * 100) / 100 });
  }
  const last = ws.rowCount;
  ws.addRow({ title: 'TOTAL', hours: { formula: `SUM(F2:F${Math.max(last, 2)})` } }).font = { bold: true };
  ws.getColumn('hours').numFmt = '0.00';
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const res = await dialog.showSaveDialog(win, {
    defaultPath: `horas_${from}_${to}.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });
  if (res.canceled) return null;
  await wb.xlsx.writeFile(res.filePath);
  shell.showItemInFolder(res.filePath);
  return res.filePath;
}

// ---------- chat por tarea ----------
const chat = createChat({
  db: () => db,
  push,
  commit,
  emit: (ch, payload) => { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); },
  ensureTimer: (taskId) => { if (activeEntry()?.taskId !== taskId) startTimer(taskId); },
});

// ---------- IPC ----------
function api(name, fn) {
  ipcMain.handle(name, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

api('state', () => db);
api('task:save', (t) => {
  const i = db.tasks.findIndex((x) => x.id === t.id);
  if (i >= 0) {
    db.tasks[i] = { ...db.tasks[i], ...t };
    if (t.status === 'done' && !db.tasks[i].doneAt) {
      db.tasks[i].doneAt = Date.now();
      if (activeEntry()?.taskId === t.id) stopActive();
      if (db.paused === t.id) db.paused = null;
    }
    if (t.status && t.status !== 'done') db.tasks[i].doneAt = null;
  } else {
    db.tasks.push({
      id: uid(), title: '', description: '', project: '', client: '', folder: '', priority: 'med',
      estimateMin: 0, status: 'today', recurrence: { type: 'none' }, createdAt: Date.now(), doneAt: null, ...t,
    });
  }
  commit();
  generateRecurring();
});
api('task:delete', (id) => {
  if (activeEntry()?.taskId === id) stopActive();
  if (db.paused === id) db.paused = null;
  chat.cancel(id);
  delete db.chats[id];
  db.tasks = db.tasks.filter((t) => t.id !== id);
  db.entries = db.entries.filter((e) => e.taskId !== id);
  commit();
});
api('timer:start', (taskId) => { startTimer(taskId); commit(); });
api('timer:stop', () => { stopActive(); db.paused = null; commit(); });
api('timer:pause', () => {
  const e = activeEntry();
  if (!e) return;
  stopActive();
  db.paused = e.taskId;
  commit();
});
api('timer:resume', () => {
  if (db.paused && db.tasks.some((t) => t.id === db.paused)) startTimer(db.paused);
  db.paused = null;
  commit();
});
api('win:restore', () => showWin());
// abre una terminal visible con `claude auth login` (el login es interactivo y abre el navegador)
api('claude:login', () => {
  const script = `$Host.UI.RawUI.WindowTitle = 'Claude: iniciar sesión'; & ${db.settings.claudeCmd} auth login`;
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  spawn('cmd.exe', ['/c', 'start', '', 'powershell.exe', '-NoExit', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64], {
    detached: true, stdio: 'ignore', windowsHide: true,
  }).unref();
});
api('task:prompt', (id) => renderPrompt(db.tasks.find((t) => t.id === id)));
api('chat:send', (taskId, text) => { chat.send(taskId, text); return true; }); // true = aceptado (el renderer restaura el input si llega undefined)
api('chat:cancel', (taskId) => chat.cancel(taskId));
api('chat:reset', (taskId) => chat.reset(taskId));
// Resume la conversación (solo lo nuevo desde el último resumen) y lo agrega a "Lo realizado" de la tarea
const summarizing = new Set();
const stamp = () => { const d = new Date(); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
api('chat:summarize', async (taskId) => {
  const t = db.tasks.find((x) => x.id === taskId);
  const c = db.chats?.[taskId];
  if (!t || !c) throw new Error('No hay conversación para resumir.');
  if (c.running) throw new Error('Espera a que Claude termine de responder.');
  if (summarizing.has(taskId)) throw new Error('Ya se está generando el resumen.');
  const from = c.summarizedCount || 0;
  const upto = c.messages.length;
  const msgs = c.messages.slice(from).filter((m) => m.role === 'user' || m.role === 'assistant');
  if (!msgs.length) throw new Error('No hay mensajes nuevos desde el último resumen.');
  const since = c.messages[from]?.ts || 0;
  const files = [...new Set(c.activity.filter((a) => a.kind === 'edit' && a.status !== 'error' && a.ts >= since).map((a) => a.target))];
  summarizing.add(taskId);
  try {
    const r = await summarizeConversation({ messages: msgs, files, claudeCmd: db.settings.claudeCmd });
    const task = db.tasks.find((x) => x.id === taskId);
    if (!task) throw new Error('La tarea ya no existe.');
    const block = `[${stamp()}]\n${r.text}`;
    task.workDone = task.workDone ? `${task.workDone.trimEnd()}\n\n${block}` : block;
    c.summarizedCount = upto; // si el chat se reinició mientras tanto, c es un objeto descartado y no afecta
    commit();
    return { text: r.text, mode: r.mode };
  } finally {
    summarizing.delete(taskId);
  }
});
api('entry:update', (e) => {
  const i = db.entries.findIndex((x) => x.id === e.id);
  if (i >= 0) db.entries[i] = { ...db.entries[i], ...e };
  commit();
});
api('entry:delete', (id) => { db.entries = db.entries.filter((e) => e.id !== id); commit(); });
api('entry:add', (e) => { db.entries.push({ id: uid(), note: '', ...e }); commit(); });
api('settings:save', (s) => { db.settings = { ...db.settings, ...s }; commit(); });
api('claude:open', (taskId) => {
  const t = db.tasks.find((x) => x.id === taskId);
  openClaude(t);
  if (!activeEntry() || activeEntry().taskId !== taskId) startTimer(taskId);
  commit();
});
api('vscode:open', (folder) => openVSCode(folder));
api('folder:pick', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
api('git:commits', async (day) => {
  const folders = [...new Set(db.tasks.map((t) => t.folder).filter(Boolean))];
  const out = {};
  for (const f of folders) {
    const c = await gitCommits(f, day);
    if (c.length) out[f] = c;
  }
  return out;
});
// rellena la nota de las entradas vacías del día con los commits del proyecto
api('draft:fillNotes', async (day) => {
  const f = new Date(day + 'T00:00:00').getTime();
  let filled = 0;
  const cache = {};
  for (const e of db.entries) {
    if (e.note || e.start < f || e.start >= f + 86400000) continue;
    const folder = db.tasks.find((t) => t.id === e.taskId)?.folder;
    if (!folder) continue;
    cache[folder] = cache[folder] || (await gitCommits(folder, day));
    if (!cache[folder].length) continue;
    e.note = cache[folder].slice(0, 5).join('; ');
    filled++;
  }
  if (filled) commit();
  return filled;
});
api('excel:export', (from, to) => exportExcel(from, to));

// ---------- ventana ----------
function showWin() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#0f1115',
    title: 'Shutoki',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  createMini();
  // al minimizar aparece la ventana flotante; al volver, se oculta
  win.on('minimize', () => { if (mini && !mini.isDestroyed()) mini.showInactive(); });
  for (const ev of ['restore', 'show']) win.on(ev, () => { if (mini && !mini.isDestroyed()) mini.hide(); });
  win.on('closed', () => { if (mini && !mini.isDestroyed()) mini.destroy(); });
}

function createMini() {
  const wa = require('electron').screen.getPrimaryDisplay().workArea;
  const w = 360, h = 108;
  mini = new BrowserWindow({
    width: w, height: h, x: wa.x + wa.width - w - 16, y: wa.y + wa.height - h - 16,
    frame: false, alwaysOnTop: true, skipTaskbar: true, resizable: false, maximizable: false,
    minimizable: false, fullscreenable: false, show: false, backgroundColor: '#171a21',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  mini.setAlwaysOnTop(true, 'screen-saver');
  mini.loadFile(path.join(__dirname, 'renderer', 'mini.html'));
}

// La app se llamaba "mis-tareas": se conserva esa carpeta de datos para no perder tareas, horas ni chats al renombrar.
app.setPath('userData', path.join(app.getPath('appData'), 'mis-tareas'));

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', showWin);
  app.whenReady().then(() => {
    dataFile = path.join(app.getPath('userData'), 'data.json');
    load();
    // los timers abiertos de una sesión anterior se cierran al último latido
    const hb = db.heartbeat || null;
    if (hb) for (const e of db.entries) if (!e.end) e.end = Math.max(e.start, hb);
    createWindow();
    generateRecurring();
    globalShortcut.register('Control+Alt+N', () => {
      showWin();
      win.webContents.send('quickadd');
    });
    setInterval(() => { db.heartbeat = Date.now(); checkIdle(); checkReminder(); }, 30000);
    setInterval(() => { generateRecurring(); }, 10 * 60 * 1000);
    setInterval(() => { if (activeEntry()) { save(); } }, 60000);
  });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); chat.killAll(); try { save(); } catch {} });
  app.on('window-all-closed', () => app.quit());
}
