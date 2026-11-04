const $ = (s, r = document) => r.querySelector(s);
const call = window.api.call;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDur = (ms) => { const s = Math.floor(ms / 1000); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; };
const fmtH = (ms) => (ms / 3600000).toFixed(2);
const hhmm = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const toTs = (day, hm) => new Date(`${day}T${hm}:00`).getTime();

const STATUS = { next: 'Próximas', today: 'Hoy', doing: 'En curso', done: 'Hecha' };
const PRIO = { high: 'Alta', med: 'Media', low: 'Baja' };
const DOW = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

let S = null;
let view = 'today';
let hoursDay = dayKey(new Date());
let commitsCache = {};
let chatTask = null;
let liveText = '';
let lastMsgCount = 0;

// ---------- chat por tarea ----------
function md(text) {
  return String(text ?? '').split('```').map((part, i) => {
    if (i % 2) return `<pre><button class="copy" data-act="copyCode">Copiar</button>${esc(part.replace(/^[\w-]*\n/, ''))}</pre>`;
    return esc(part).replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  }).join('');
}
const ACT_ICON = { edit: '✎', read: '👁', run: '⌘', search: '⌕', other: '•' };
const SVG = (p, fill) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICON_SEND = SVG('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>');
const ICON_STOP = SVG('<rect x="6" y="6" width="12" height="12" rx="2.5"/>', true);

// diff por líneas sencillo: recorta el prefijo y sufijo comunes y muestra lo quitado / lo agregado
function renderHunk(h) {
  const L = (cls, sign, lines) => lines.map((l) => `<div class="dl ${cls}"><i>${sign}</i><span>${esc(l) || ' '}</span></div>`).join('');
  if (h.old == null) return L('add', '+', h.new.split('\n'));
  const a = h.old.split('\n'), b = h.new.split('\n');
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  return L('ctx', ' ', a.slice(Math.max(0, s - 2), s)) + L('del', '−', a.slice(s, ea)) + L('add', '+', b.slice(s, eb)) + L('ctx', ' ', a.slice(ea, ea + 2));
}
function showFileDiff(file) {
  const c = S.chats?.[chatTask];
  const edits = (c?.activity || []).filter((a) => a.kind === 'edit' && a.target === file && a.status !== 'error');
  const body = edits.map((a, i) => `<div class="hunk"><div class="hunk-h"><b>${esc(a.label)}</b> · ${hhmm(a.ts)} <span class="chip">cambio ${i + 1} de ${edits.length}</span></div>
    <div class="diff">${a.hunks?.length ? a.hunks.map(renderHunk).join('<div class="dl sep"><i></i><span>⋯</span></div>') : '<div class="meta" style="padding:8px">Sin detalle guardado (cambio anterior a esta función).</div>'}</div></div>`).join('');
  $('#modal').classList.remove('hidden');
  $('#modal').innerHTML = `<div class="dialog wide"><h2><code>${esc(file)}</code></h2><div class="sub">${edits.length} ${edits.length === 1 ? 'cambio' : 'cambios'} hechos por Claude en esta conversación</div>${body || '<div class="empty">Sin cambios registrados</div>'}
    <div class="foot"><span class="sp"></span><button class="btn" data-act="closeModal">Cerrar</button></div></div>`;
}
const SUGGESTIONS = [
  ['Resume lo hecho', 'Resume en pocas líneas qué has hecho hasta ahora y qué falta.'],
  ['Revisa los cambios', 'Revisa los cambios que hiciste y busca posibles errores.'],
  ['Escribe tests', 'Escribe tests para los cambios realizados.'],
  ['Explica el código', 'Explícame cómo funciona el código relevante para esta tarea.'],
  ['Siguiente paso', '¿Cuál es el siguiente paso recomendado?'],
];

// el textarea crece con el contenido y el botón de enviar se desactiva si está vacío
function syncComposer() {
  const input = $('#chatInput');
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight + 2, 160) + 'px';
  const btn = $('#chatBtn');
  if (btn && btn.dataset.act === 'chatSend') btn.disabled = !input.value.trim();
}

function viewChat() {
  const t = task(chatTask);
  return `<div class="chat-head">
    <button class="btn sm" data-act="chatBack">← Volver</button>
    <div class="grow"><b>${esc(t?.title)}</b><div class="meta">${esc(t?.client || '')} ${t?.project ? `<span class="chip">${esc(t.project)}</span>` : ''} <span title="${esc(t?.folder)}">📁 ${esc((t?.folder || 'sin carpeta').split(/[\\/]/).pop())}</span></div></div>
    <button class="btn sm" id="sumBtn" data-act="chatSummarize" title="Genera un resumen de la conversación y lo agrega a «Lo realizado» de la tarea">✦ Resumir en la tarea</button>
    <button class="btn sm" data-act="chatTask" title="Ver / editar la tarea">Ver tarea</button>
    <button class="btn sm" data-act="chatDesktop" title="Abre una sesión nueva en Claude Desktop con el prompt de la tarea">Abrir en Claude Desktop</button>
    <button class="btn sm" data-act="chatCopyResume" title="Copia el comando para seguir esta misma conversación en una terminal">Continuar en terminal</button>
    <button class="btn sm danger" data-act="chatReset">Reiniciar chat</button>
  </div>
  <div class="chat-wrap">
    <div class="chat-main">
      <div id="msgs" class="msgs"></div>
      <div class="suggest" id="suggest">${SUGGESTIONS.map(([l, t]) => `<button data-act="suggest" data-t="${esc(t)}">${esc(l)}</button>`).join('')}</div>
      <div class="composer">
        <textarea id="chatInput" rows="1" placeholder="Escribe a Claude…"></textarea>
        <button class="btn primary send" id="chatBtn" data-act="chatSend" title="Enviar (Enter)">${ICON_SEND}</button>
      </div>
      <div class="composer-hint"><span>Enter envía · Shift+Enter nueva línea</span><span id="chatState"></span></div>
    </div>
    <aside class="activity">
      <h3 style="margin-top:0">Archivos modificados</h3><div id="files"></div>
      <h3>Actividad en vivo</h3><div id="feed"></div>
    </aside>
  </div>`;
}

function updateChat() {
  if (view !== 'chat' || !$('#msgs')) return;
  const c = S.chats?.[chatTask] || { messages: [], activity: [], running: false };
  if (c.messages.length !== lastMsgCount) { liveText = ''; lastMsgCount = c.messages.length; }
  const box = $('#msgs');
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.innerHTML =
    (c.messages.map((m) => `<div class="msg ${m.role}">${m.role === 'user' ? esc(m.text).replace(/\n/g, '<br>') : md(m.text)}${m.action === 'login' ? '<div class="foot" style="margin-top:8px"><button class="btn sm primary" data-act="chatLogin">Abrir terminal: claude auth login</button><button class="btn sm" data-act="chatRetry">Reintentar mensaje</button></div>' : ''}${m.role !== 'system' && m.ts ? `<span class="time">${hhmm(m.ts)}</span>` : ''}</div>`).join('') ||
      '<div class="empty">Conversación nueva para esta tarea. Claude trabajará en la carpeta del proyecto y puede editar archivos.</div>') +
    (c.running ? `<div class="msg assistant live" id="live">${liveText ? md(liveText) : '<span class="typing"><i></i><i></i><i></i>&nbsp;Claude está trabajando…</span>'}</div>` : '');
  if (nearBottom) box.scrollTop = box.scrollHeight;

  const edits = {};
  c.activity.filter((a) => a.kind === 'edit' && a.status !== 'error').forEach((a) => { edits[a.target] = (edits[a.target] || 0) + 1; });
  $('#files').innerHTML = Object.keys(edits).length
    ? Object.entries(edits).map(([f, n]) => `<div class="act edit file" data-act="fileDiff" data-f="${esc(f)}" title="Ver qué cambió"><span class="ico">✎</span><code class="grow">${esc(f)}</code>${n > 1 ? `<span class="chip">×${n}</span>` : ''}<span class="st">›</span></div>`).join('')
    : '<div class="meta">Nada modificado todavía</div>';
  $('#feed').innerHTML = c.activity.length
    ? [...c.activity].reverse().slice(0, 80).map((a) => `<div class="act ${a.kind} ${a.status}" title="${esc(a.detail || '')}">
        <span class="ico">${ACT_ICON[a.kind] || '•'}</span><div class="grow"><b>${esc(a.label)}</b> <code>${esc(a.target)}</code>${a.detail ? `<div class="meta">${esc(a.detail)}</div>` : ''}</div>
        <span class="st">${a.status === 'running' ? '…' : a.status === 'ok' ? '✓' : '✕'}</span></div>`).join('')
    : '<div class="meta">Aquí verás qué lee, edita o ejecuta Claude.</div>';
  const btn = $('#chatBtn');
  btn.innerHTML = c.running ? ICON_STOP : ICON_SEND;
  btn.title = c.running ? 'Detener respuesta' : 'Enviar (Enter)';
  btn.classList.toggle('stop', !!c.running);
  btn.dataset.act = c.running ? 'chatCancel' : 'chatSend';
  if (c.running) btn.disabled = false;
  $('#suggest').classList.toggle('hidden', !!c.running);
  $('#chatState').textContent = c.running ? 'Claude está respondiendo…' : '';
  syncComposer();
}

async function openChat(id) {
  chatTask = id;
  view = 'chat';
  lastMsgCount = -1;
  liveText = '';
  renderChrome();
  $('#view').innerHTML = viewChat();
  updateChat();
  $('#msgs').scrollTop = $('#msgs').scrollHeight;
  const input = $('#chatInput');
  input.focus();
  // conversación nueva: precarga el prompt de la tarea para revisarlo y enviarlo con Enter
  if (!(S.chats?.[id]?.messages || []).length) {
    const p = await run('task:prompt', id);
    if (p && chatTask === id && !input.value) { input.value = p; input.setSelectionRange(p.length, p.length); syncComposer(); }
  }
}

async function sendChat() {
  const input = $('#chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  syncComposer();
  liveText = '';
  const r = await run('chat:send', chatTask, text);
  if (r === undefined) { input.value = text; syncComposer(); } // falló: no perder lo escrito
}

function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (err ? ' err' : '');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.add('hidden'), err ? 6000 : 2500);
}
async function run(name, ...args) {
  try { return await call(name, ...args); } catch (e) { toast(e.message, true); return undefined; }
}

const active = () => S.entries.find((e) => !e.end);
const task = (id) => S.tasks.find((t) => t.id === id);

function msToday() {
  const st = new Date(); st.setHours(0, 0, 0, 0);
  let ms = 0;
  for (const e of S.entries) {
    const end = e.end || Date.now();
    const s = Math.max(e.start, st.getTime());
    if (end > s) ms += end - s;
  }
  return ms;
}
function taskMs(id) {
  return S.entries.filter((e) => e.taskId === id).reduce((a, e) => a + ((e.end || Date.now()) - e.start), 0);
}

// ---------- chrome ----------
function renderChrome() {
  const a = active();
  const bar = $('#timerBar');
  if (a) {
    const t = task(a.taskId);
    bar.classList.remove('hidden');
    bar.innerHTML = `<span class="pulse"></span><div class="name">${esc(t?.title)} <span class="chip">${esc(t?.project || 'sin proyecto')}</span></div><div class="t" id="tick">${fmtDur(Date.now() - a.start)}</div><button class="btn" data-act="pause">⏸ Pausar</button><button class="btn" data-act="stop">■ Detener</button>`;
  } else if (S.paused && task(S.paused)) {
    bar.classList.remove('hidden');
    bar.innerHTML = `<span class="pulse" style="background:var(--warn);animation:none"></span><div class="name">${esc(task(S.paused).title)} <span class="chip">en pausa</span></div><button class="btn primary" data-act="resume">▶ Reanudar</button><button class="btn" data-act="stop">■ Detener</button>`;
  } else bar.classList.add('hidden');
  tickDay();
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
}
function tickDay() {
  const ms = msToday();
  const target = S.settings.targetHours * 3600000;
  $('#dayBar').innerHTML = `<div><b>${fmtH(ms)} h</b> / ${S.settings.targetHours} h hoy</div><div class="bar"><i style="width:${Math.min(100, (ms / target) * 100)}%"></i></div>`;
  const tk = $('#tick');
  const a = active();
  if (tk && a) tk.textContent = fmtDur(Date.now() - a.start);
}
setInterval(() => { if (S) tickDay(); }, 1000);

// ---------- vistas ----------
function taskRow(t) {
  const running = active()?.taskId === t.id;
  const spent = taskMs(t.id);
  return `<div class="row ${t.status} ${running ? 'doing' : ''}" data-id="${t.id}" data-act="claude">
    <button class="check ${t.status === 'done' ? 'on' : ''}" data-act="toggle" title="Completar"></button>
    <div class="main">
      <div class="title">${esc(t.title)}</div>
      <div class="meta">
        ${t.client ? `<span>${esc(t.client)}</span>` : ''}
        ${t.project ? `<span class="chip">${esc(t.project)}</span>` : ''}
        <span class="chip ${t.priority}">${PRIO[t.priority]}</span>
        ${t.recurrence?.type && t.recurrence.type !== 'none' ? '<span class="chip">↻ recurrente</span>' : ''}
        ${t.fromTemplate ? `<span class="chip ${t.carried ? 'high' : ''}">↻ rutina${t.carried ? ` · pendiente hace ${t.carried} d` : ''}</span>` : ''}
        ${spent ? `<span>⏱ ${fmtH(spent)} h${t.estimateMin ? ' / ' + (t.estimateMin / 60).toFixed(1) + ' h' : ''}</span>` : t.estimateMin ? `<span>est. ${(t.estimateMin / 60).toFixed(1)} h</span>` : ''}
        ${t.folder ? `<span title="${esc(t.folder)}">📁 ${esc(t.folder.split(/[\\/]/).pop())}</span>` : '<span>sin carpeta</span>'}
      </div>
    </div>
    <div class="actions">
      <button class="icon" data-act="${running ? 'stop' : 'start'}" title="${running ? 'Detener timer' : 'Iniciar timer'}">${running ? '■' : '▶'}</button>
      <button class="icon" data-act="chat" title="Chat con Claude para esta tarea">💬${S.chats?.[t.id]?.messages?.length ? '' : ''}</button>
      <button class="icon" data-act="vscode" title="Abrir en VS Code">⟨/⟩</button>
      <button class="icon" data-act="edit" title="Editar">✎</button>
    </div>
  </div>`;
}

function viewToday() {
  const open = S.tasks.filter((t) => !t.archived && (!t.recurrence || t.recurrence.type === 'none'));
  const list = (st) => open.filter((t) => t.status === st);
  const doneToday = open.filter((t) => t.status === 'done' && t.doneAt && dayKey(new Date(t.doneAt)) === dayKey(new Date()));
  const pri = { high: 0, med: 1, low: 2 };
  const sorted = (a) => a.sort((x, y) => pri[x.priority] - pri[y.priority]);
  const doing = sorted(list('doing')), today = sorted(list('today')), next = sorted(list('next'));
  const section = (title, arr) => arr.length ? `<h3>${title} · ${arr.length}</h3>${arr.map(taskRow).join('')}` : '';
  const d = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  return `<h1>Hoy</h1><div class="sub">${d} · click en una tarea abre Claude en su carpeta</div>
  <div class="quick"><input id="quick" placeholder="Nueva tarea para hoy… (Enter)"><button class="btn primary" data-act="new">Detallada</button></div>
  ${section('En curso', doing)}${section('Para hoy', today)}
  ${!doing.length && !today.length ? '<div class="empty">Nada pendiente para hoy 🎉 — añade una tarea arriba.</div>' : ''}
  ${section('Próximas', next.slice(0, 8))}${section('Completadas hoy', doneToday)}`;
}

function viewBoard() {
  const open = S.tasks.filter((t) => !t.archived && (!t.recurrence || t.recurrence.type === 'none'));
  const cutoff = Date.now() - 7 * 86400000;
  const cols = Object.keys(STATUS).map((st) => {
    const arr = open.filter((t) => t.status === st && (st !== 'done' || (t.doneAt || 0) > cutoff));
    return `<div class="col" data-status="${st}"><h4><span>${STATUS[st]}</span><span>${arr.length}</span></h4>
      ${arr.map((t) => `<div class="card" draggable="true" data-id="${t.id}" data-act="claude">
        <div class="title">${esc(t.title)}</div>
        <div class="meta">${t.project ? `<span class="chip">${esc(t.project)}</span>` : ''}<span class="chip ${t.priority}">${PRIO[t.priority]}</span>${taskMs(t.id) ? `<span>⏱ ${fmtH(taskMs(t.id))} h</span>` : ''}
        <button class="icon" data-act="chat" style="margin-left:auto">💬</button><button class="icon" data-act="edit">✎</button></div></div>`).join('')}
    </div>`;
  }).join('');
  return `<h1>Tablero</h1><div class="sub">Arrastra las tarjetas entre columnas</div><div class="board">${cols}</div>
  <h3>Rutinas recurrentes</h3>${S.tasks.filter((t) => t.recurrence && t.recurrence.type !== 'none').map((t) => `<div class="row" data-id="${t.id}" data-act="edit"><div class="main"><div class="title">${esc(t.title)}</div><div class="meta"><span class="chip">↻ ${recText(t.recurrence)}</span>${t.project ? `<span class="chip">${esc(t.project)}</span>` : ''}</div></div></div>`).join('') || '<div class="empty">Sin rutinas. Crea una tarea y márcala como recurrente (daily, reporte, imputar horas…).</div>'}`;
}
const recText = (r) => r.type === 'daily' ? 'todos los días' : r.type === 'weekdays' ? 'lunes a viernes' : 'semanal: ' + (r.days || []).map((d) => DOW[d]).join(' ');

function dayEntries(day) {
  const f = toTs(day, '00:00'), t = f + 86400000;
  return S.entries.filter((e) => e.start >= f && e.start < t).sort((a, b) => a.start - b.start);
}
function viewHours() {
  const es = dayEntries(hoursDay);
  const total = es.reduce((a, e) => a + ((e.end || Date.now()) - e.start), 0);
  const byTask = {};
  es.forEach((e) => { byTask[e.taskId] = (byTask[e.taskId] || 0) + ((e.end || Date.now()) - e.start); });
  const month = hoursDay.slice(0, 8);
  const commits = commitsCache[hoursDay];
  const missing = S.settings.targetHours - total / 3600000;
  const pend = hoursDay === dayKey(new Date()) ? S.tasks.filter((t) => !t.archived && (!t.recurrence || t.recurrence.type === 'none') && (t.status === 'today' || t.status === 'doing')) : [];
  const draft = `<div class="row" style="cursor:default;display:block;border-color:${missing > 0 ? 'var(--warn)' : 'var(--accent2)'}">
    <b>Borrador del día</b> · ${missing > 0 ? `te faltan ${missing.toFixed(2)} h para llegar a ${S.settings.targetHours} h` : `objetivo cumplido (${fmtH(total)} h)`}
    ${pend.length ? `<div class="meta">Pendientes hoy: ${pend.map((t) => esc(t.title)).join(' · ')}</div>` : ''}
    <div class="foot" style="margin-top:10px"><button class="btn sm" data-act="fillNotes">Rellenar notas con commits</button><button class="btn sm" data-act="copyDraft">Copiar resumen</button></div></div>`;
  return `<h1>Horas</h1><div class="sub">Revisa el día, corrige y exporta a Excel para imputar</div>
  ${draft}
  <div class="toolbar">
    <div><label>Día</label><input type="date" id="hday" value="${hoursDay}"></div>
    <button class="btn" data-act="addEntry">+ Entrada manual</button>
    <button class="btn" data-act="loadCommits">Ver commits del día</button>
    <div style="margin-left:auto;width:auto"><b>Total: ${fmtH(total)} h</b> / ${S.settings.targetHours} h</div>
  </div>
  <table><tr><th>Tarea</th><th style="width:90px">Inicio</th><th style="width:90px">Fin</th><th style="width:60px">Horas</th><th>Nota para imputar</th><th style="width:40px"></th></tr>
  ${es.map((e) => `<tr data-eid="${e.id}"><td>${esc(task(e.taskId)?.title || '(tarea borrada)')}<div class="meta">${esc(task(e.taskId)?.client || '')} ${esc(task(e.taskId)?.project || '')}</div></td>
    <td><input type="time" data-f="start" value="${hhmm(e.start)}"></td>
    <td>${e.end ? `<input type="time" data-f="end" value="${hhmm(e.end)}">` : '<span class="chip">en curso</span>'}</td>
    <td>${fmtH((e.end || Date.now()) - e.start)}</td>
    <td><input data-f="note" value="${esc(e.note)}" placeholder="qué hiciste…"></td>
    <td><button class="icon" data-act="delEntry">✕</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sin registros este día.</td></tr>'}
  </table>
  ${Object.keys(byTask).length ? `<h3>Resumen por tarea</h3>${Object.entries(byTask).map(([id, ms]) => `<div class="row" style="cursor:default"><div class="main"><div class="title">${esc(task(id)?.title)}</div><div class="meta">${esc(task(id)?.client || '')} ${esc(task(id)?.project || '')}</div></div><b>${fmtH(ms)} h</b></div>`).join('')}` : ''}
  ${commits ? `<h3>Commits de hoy (ayuda para recordar)</h3>${Object.keys(commits).length ? Object.entries(commits).map(([f, c]) => `<div class="row" style="cursor:default;display:block"><b>${esc(f.split(/[\\/]/).pop())}</b>${c.map((m) => `<div class="commit">• ${esc(m)}</div>`).join('')}</div>`).join('') : '<div class="empty">No hay commits (o git no está disponible).</div>'}` : ''}
  <h3>Exportar a Excel</h3>
  <div class="toolbar"><div><label>Desde</label><input type="date" id="xfrom" value="${month}01"></div><div><label>Hasta</label><input type="date" id="xto" value="${dayKey(new Date())}"></div>
  <button class="btn primary" data-act="export">Exportar .xlsx</button></div>`;
}

function viewSettings() {
  const s = S.settings;
  return `<h1>Ajustes</h1><div class="sub">Todo se guarda localmente</div>
  <div class="grid2" style="max-width:700px">
    <div><label>Horas objetivo por día</label><input id="s_target" type="number" step="0.5" value="${s.targetHours}"></div>
    <div><label>Recordatorio de cierre del día</label><input id="s_rem" type="time" value="${s.reminderTime}"></div>
    <div><label>Pausar timer tras X min inactivo (0 = nunca)</label><input id="s_idle" type="number" value="${s.idleMinutes}"></div>
    <div style="grid-column:span 2"><label>Al hacer click en una tarea abrir con…</label><select id="s_mode"><option value="chat" ${!s.openMode || s.openMode === 'chat' ? 'selected' : ''}>Chat de esta app (prompt precargado)</option><option value="desktop" ${s.openMode === 'desktop' ? 'selected' : ''}>Claude Desktop (carpeta y prompt precargados)</option><option value="terminal" ${s.openMode === 'terminal' ? 'selected' : ''}>PowerShell con el comando claude</option></select></div>
    <div style="grid-column:span 2"><label>Resumen automático de lo hecho en Claude (al pausar, detener o completar)</label><select id="s_sum"><option value="ai" ${s.summaryMode === 'ai' ? 'selected' : ''}>Con IA (usa tu Claude Code, gasta algo de uso)</option><option value="local" ${s.summaryMode === 'local' ? 'selected' : ''}>Local: primer pedido + archivos modificados</option><option value="off" ${s.summaryMode === 'off' ? 'selected' : ''}>Desactivado</option></select></div>
    <div><label>Comando de Claude (resumen IA y modo PowerShell)</label><input id="s_cmd" value="${esc(s.claudeCmd)}"></div>
    <div style="grid-column:span 2"><label>Autor git para commits del día (vacío = todos)</label><input id="s_git" value="${esc(s.gitAuthor || '')}" placeholder="tu@correo.com"></div>
  </div>
  <label style="max-width:700px">Plantilla del prompt inicial de Claude · variables: {{title}} {{description}} {{project}} {{client}}</label>
  <textarea id="s_tpl" style="max-width:700px;min-height:160px">${esc(s.promptTemplate)}</textarea>
  <div class="foot"><button class="btn primary" data-act="saveSettings">Guardar</button></div>`;
}

function render() {
  if (!S) return;
  renderChrome();
  if (view === 'chat') return updateChat();
  const focus = document.activeElement?.id;
  const v = { today: viewToday, board: viewBoard, hours: viewHours, settings: viewSettings }[view]();
  // no re-render mientras se escribe en un campo
  if (focus === 'quick' && !document.activeElement.value) { /* vacío: se puede refrescar */ }
  else if (['quick', 'hday', 's_mode', 's_sum', 's_tpl', 's_cmd', 's_git', 's_target', 's_rem', 's_idle', 'xfrom', 'xto'].includes(focus) || document.activeElement?.dataset?.f) return;
  $('#view').innerHTML = v;
  if (view === 'today') $('#quick')?.focus();
}

// ---------- modal de tarea ----------
function editTask(t) {
  const isNew = !t.id;
  const r = t.recurrence || { type: 'none' };
  $('#modal').classList.remove('hidden');
  $('#modal').innerHTML = `<div class="dialog">
    <h2>${isNew ? 'Nueva tarea' : 'Editar tarea'}</h2>
    <label>Título</label><input id="m_title" value="${esc(t.title)}">
    <label>Descripción / contexto para Claude</label><textarea id="m_desc">${esc(t.description)}</textarea>
    ${isNew && !t.workDone ? '' : `<label>Lo realizado (resumen del trabajo hecho)</label><textarea id="m_done" style="min-height:120px" placeholder="Se completa con el botón «Resumir en la tarea» del chat. También puedes editarlo a mano.">${esc(t.workDone)}</textarea>`}
    <div class="grid2">
      <div><label>Cliente</label><input id="m_client" value="${esc(t.client)}"></div>
      <div><label>Proyecto</label><input id="m_project" value="${esc(t.project)}"></div>
    </div>
    <label>Carpeta del proyecto</label>
    <div class="folder"><input id="m_folder" value="${esc(t.folder)}" placeholder="C:\\proyectos\\mi-app"><button class="btn" data-act="pick">Elegir…</button></div>
    <div class="grid2">
      <div><label>Prioridad</label><select id="m_prio">${Object.entries(PRIO).map(([k, v]) => `<option value="${k}" ${t.priority === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label>Estado</label><select id="m_status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label>Estimación (horas)</label><input id="m_est" type="number" step="0.25" value="${t.estimateMin ? t.estimateMin / 60 : ''}"></div>
      <div><label>Repetir</label><select id="m_rec">
        ${[['none', 'No se repite'], ['daily', 'Todos los días'], ['weekdays', 'Lunes a viernes'], ['weekly', 'Días de la semana…']].map(([k, v]) => `<option value="${k}" ${r.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    </div>
    <div id="m_days" class="days ${r.type === 'weekly' ? '' : 'hidden'}" style="margin-top:8px">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label><input type="checkbox" value="${d}" ${(r.days || []).includes(d) ? 'checked' : ''}>${DOW[d]}</label>`).join('')}</div>
    ${(t.log || []).length ? `<label>Historial de lo hecho (resúmenes de Claude)</label>${[...t.log].reverse().map((l) => `<div class="commit" style="margin-bottom:6px">${new Date(l.ts).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${esc(l.text)}</div>`).join('')}` : ''}
    <div class="foot">
      ${isNew ? '' : '<button class="btn danger" data-act="delTask">Eliminar</button>'}
      <span class="sp"></span>
      <button class="btn" data-act="closeModal">Cancelar</button>
      <button class="btn primary" data-act="saveTask">Guardar</button>
    </div></div>`;
  $('#modal').dataset.id = t.id || '';
  $('#m_rec').onchange = (e) => $('#m_days').classList.toggle('hidden', e.target.value !== 'weekly');
  $('#m_title').focus();
}
const closeModal = () => { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; };

async function saveTask() {
  const rec = $('#m_rec').value;
  const days = [...document.querySelectorAll('#m_days input:checked')].map((i) => +i.value);
  const title = $('#m_title').value.trim();
  if (!title) return toast('Pon un título', true);
  const est = parseFloat($('#m_est').value);
  const data = {
    id: $('#modal').dataset.id || undefined,
    title, description: $('#m_desc').value, client: $('#m_client').value.trim(), project: $('#m_project').value.trim(),
    folder: $('#m_folder').value.trim(), priority: $('#m_prio').value, status: $('#m_status').value,
    estimateMin: isNaN(est) ? 0 : Math.round(est * 60),
    recurrence: { type: rec, days },
  };
  if ($('#m_done')) data.workDone = $('#m_done').value;
  if (!data.id) data.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  await run('task:save', data);
  closeModal();
}

// ---------- perfil y tema ----------
let menuOpen = false;
function initials(n) {
  const p = n.trim().split(/\s+/).filter(Boolean);
  return (p.length ? (p[0][0] + (p[1]?.[0] || '')) : '?').toUpperCase();
}
function renderProfile() {
  const n = Theme.name(), m = Theme.mode();
  $('#profile').innerHTML = `<button class="profile-btn" data-act="profileMenu" title="Perfil y apariencia">
      <span class="avatar">${esc(initials(n))}</span><span class="pname">${esc(n || 'Tu perfil')}</span></button>` +
    (menuOpen ? `<div class="pmenu" id="pmenu">
      <label>Tu nombre</label><input id="p_name" value="${esc(n)}" placeholder="Ej. Marti" maxlength="30">
      <label style="margin-top:10px">Apariencia</label>
      <div class="seg">${[['light', '☀ Día'], ['dark', '☾ Noche'], ['system', '⌂ Auto']].map(([k, l]) => `<button data-act="theme" data-m="${k}" class="${m === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <button class="btn sm" data-act="profileSettings" style="width:100%">⚙ Ajustes</button></div>` : '');
}

// ---------- eventos ----------
document.addEventListener('click', async (ev) => {
  if (menuOpen && !ev.target.closest('#profile')) { menuOpen = false; renderProfile(); }
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const holder = el.closest('[data-id]');
  const id = holder?.dataset.id;
  const stop = () => ev.stopPropagation();

  switch (act) {
    case 'profileMenu': menuOpen = !menuOpen; renderProfile(); if (menuOpen) $('#p_name')?.focus(); break;
    case 'theme': Theme.set(el.dataset.m); renderProfile(); break;
    case 'profileSettings': menuOpen = false; renderProfile(); view = 'settings'; renderChrome(); $('#view').innerHTML = viewSettings(); break;
    case 'fileDiff': showFileDiff(el.dataset.f); break;
    case 'chatTask': if (task(chatTask)) editTask(task(chatTask)); break;
    case 'chatSummarize': {
      const html = el.innerHTML;
      el.disabled = true; el.textContent = 'Generando resumen…';
      const r = await run('chat:summarize', chatTask);
      el.disabled = false; el.innerHTML = html;
      if (r) toast(r.mode === 'local' ? 'Resumen simple agregado a «Lo realizado» (no se pudo usar la IA)' : 'Resumen agregado a «Lo realizado» de la tarea');
      break;
    }
    case 'suggest': { const i = $('#chatInput'); i.value = (i.value.trim() ? i.value.trim() + '\n' : '') + el.dataset.t; i.focus(); syncComposer(); break; }
    case 'copyCode': {
      const code = el.parentElement.textContent.replace(/^Copiar|^¡Copiado!/, '');
      try { await navigator.clipboard.writeText(code); el.textContent = '¡Copiado!'; setTimeout(() => { el.textContent = 'Copiar'; }, 1200); } catch { toast('No se pudo copiar', true); }
      break;
    }
    case 'toggle': stop(); { const t = task(id); await run('task:save', { id, status: t.status === 'done' ? 'today' : 'done' }); } break;
    case 'start': stop(); await run('timer:start', id); break;
    case 'stop': stop(); await run('timer:stop'); break;
    case 'chat': stop(); openChat(id); break;
    case 'chatBack': view = 'today'; chatTask = null; renderChrome(); $('#view').innerHTML = viewToday(); break;
    case 'chatSend': await sendChat(); break;
    case 'chatCancel': await run('chat:cancel', chatTask); break;
    case 'chatReset': if (confirm('¿Borrar esta conversación y empezar una nueva para la tarea?')) { liveText = ''; await run('chat:reset', chatTask); } break;
    case 'chatCopyResume': {
      const t = task(chatTask), sid = S.chats?.[chatTask]?.sessionId;
      if (!sid) return toast('Aún no hay conversación que continuar', true);
      try { await navigator.clipboard.writeText(`cd "${t.folder}"; ${S.settings.claudeCmd} --resume ${sid}`); toast('Comando copiado: pégalo en PowerShell'); } catch { toast('No se pudo copiar', true); }
      break;
    }
    case 'pause': await run('timer:pause'); break;
    case 'resume': await run('timer:resume'); break;
    case 'vscode': stop(); await run('vscode:open', task(id).folder); break;
    case 'edit': stop(); editTask(task(id)); break;
    case 'claude': {
      const t = task(id);
      if (!t.folder) return editTask(t), toast('Asigna una carpeta de proyecto para abrir Claude', true);
      if (S.settings.openMode === 'chat' || !S.settings.openMode) { openChat(id); break; }
      await run('claude:open', id);
      toast('Abriendo Claude en ' + t.folder);
      break;
    }
    case 'chatLogin': await run('claude:login'); toast('Terminal abierta: completa el inicio de sesión en el navegador y luego pulsa "Reintentar mensaje"'); break;
    case 'chatRetry': {
      const last = [...(S.chats?.[chatTask]?.messages || [])].reverse().find((m) => m.role === 'user');
      if (!last) return toast('No hay mensaje que reintentar', true);
      await run('chat:send', chatTask, last.text);
      break;
    }
    case 'chatDesktop': await run('claude:open', chatTask); toast('Abriendo Claude Desktop (sesión nueva)'); break;
    case 'new': editTask({ title: $('#quick')?.value || '', description: '', client: '', project: '', folder: '', priority: 'med', status: 'today', recurrence: { type: 'none' } }); break;
    case 'pick': { const p = await run('folder:pick'); if (p) { $('#m_folder').value = p; if (!$('#m_project').value) $('#m_project').value = p.split(/[\\/]/).pop(); } break; }
    case 'saveTask': await saveTask(); break;
    case 'closeModal': closeModal(); break;
    case 'delTask': if (confirm('¿Eliminar tarea y sus registros de tiempo?')) { await run('task:delete', $('#modal').dataset.id); closeModal(); } break;
    case 'saveSettings':
      await run('settings:save', {
        targetHours: +$('#s_target').value || 8, reminderTime: $('#s_rem').value || '17:30', idleMinutes: +$('#s_idle').value || 0,
        openMode: $('#s_mode').value, summaryMode: $('#s_sum').value, claudeCmd: $('#s_cmd').value.trim() || 'claude', gitAuthor: $('#s_git').value.trim(), promptTemplate: $('#s_tpl').value,
      });
      toast('Ajustes guardados');
      break;
    case 'delEntry': await run('entry:delete', el.closest('tr').dataset.eid); break;
    case 'addEntry': {
      const cand = S.tasks.filter((t) => !t.archived && (!t.recurrence || t.recurrence.type === 'none'));
      if (!cand.length) return toast('Crea una tarea primero', true);
      const opts = cand.map((t, i) => `${i + 1}. ${t.title}`).join('\n');
      const n = parseInt(prompt('Tarea para la entrada:\n' + opts), 10);
      if (!n || !cand[n - 1]) return;
      await run('entry:add', { taskId: cand[n - 1].id, start: toTs(hoursDay, '09:00'), end: toTs(hoursDay, '10:00') });
      break;
    }
    case 'loadCommits': commitsCache[hoursDay] = (await run('git:commits', hoursDay)) || {}; view = 'hours'; $('#view').innerHTML = viewHours(); break;
    case 'fillNotes': { const n = await run('draft:fillNotes', hoursDay); if (n !== undefined) toast(n ? `${n} notas rellenadas con commits` : 'Sin commits que usar (¿git instalado y carpetas con repo?)', !n); break; }
    case 'copyDraft': {
      const lines = {};
      dayEntries(hoursDay).forEach((e) => {
        const t = task(e.taskId); if (!t) return;
        const k = [t.client, t.project, t.title].filter(Boolean).join(' · ');
        lines[k] = lines[k] || { ms: 0, notes: [] };
        lines[k].ms += (e.end || Date.now()) - e.start;
        if (e.note) lines[k].notes.push(e.note);
      });
      const txt = Object.entries(lines).map(([k, v]) => `- ${k}: ${fmtH(v.ms)} h${v.notes.length ? ' — ' + v.notes.join('; ') : ''}`).join('\n');
      try { await navigator.clipboard.writeText(`Horas ${hoursDay}\n${txt}`); toast('Resumen copiado'); } catch { toast('No se pudo copiar', true); }
      break;
    }
    case 'export': { const p = await run('excel:export', $('#xfrom').value, $('#xto').value); if (p) toast('Exportado: ' + p); break; }
  }
});

document.addEventListener('change', async (ev) => {
  const el = ev.target;
  if (el.id === 'hday') { hoursDay = el.value; $('#view').innerHTML = viewHours(); return; }
  const f = el.dataset.f;
  if (f) {
    const id = el.closest('tr').dataset.eid;
    const e = S.entries.find((x) => x.id === id);
    const day = dayKey(new Date(e.start));
    const patch = f === 'note' ? { note: el.value } : { [f]: toTs(day, el.value) };
    if (patch.end && patch.end <= (patch.start || e.start)) return toast('La hora fin debe ser mayor al inicio', true), render();
    await run('entry:update', { id, ...patch });
    el.blur();
  }
});

document.addEventListener('input', (ev) => {
  if (ev.target.id === 'chatInput') syncComposer();
  if (ev.target.id === 'p_name') { Theme.setName(ev.target.value.trim()); const a = $('.profile-btn .avatar'), p = $('.profile-btn .pname'); if (a) a.textContent = initials(ev.target.value); if (p) p.textContent = ev.target.value.trim() || 'Tu perfil'; }
});

document.addEventListener('keydown', async (ev) => {
  if (ev.target.id === 'chatInput' && ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
    ev.preventDefault();
    if (!S.chats?.[chatTask]?.running) await sendChat();
    return;
  }
  if (ev.target.id === 'quick' && ev.key === 'Enter' && ev.target.value.trim()) {
    const title = ev.target.value.trim();
    ev.target.value = '';
    await run('task:save', { title, status: 'today' });
  }
  if (ev.key === 'Escape') closeModal();
});

// drag & drop del tablero
let dragId = null;
document.addEventListener('dragstart', (e) => { dragId = e.target.closest?.('.card')?.dataset.id || null; });
document.addEventListener('dragover', (e) => { const c = e.target.closest?.('.col'); if (c && dragId) { e.preventDefault(); document.querySelectorAll('.col').forEach((x) => x.classList.toggle('over', x === c)); } });
document.addEventListener('drop', async (e) => {
  const c = e.target.closest?.('.col');
  document.querySelectorAll('.col').forEach((x) => x.classList.remove('over'));
  if (c && dragId) { e.preventDefault(); await run('task:save', { id: dragId, status: c.dataset.status }); }
  dragId = null;
});

$('#nav').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  view = b.dataset.view;
  renderChrome();
  $('#view').innerHTML = { today: viewToday, board: viewBoard, hours: viewHours, settings: viewSettings }[view]();
  if (view === 'today') $('#quick')?.focus();
});

window.api.onState((s) => { S = s; render(); });
window.api.onDelta((d) => {
  if (view !== 'chat' || d.taskId !== chatTask) return;
  liveText += d.text;
  const live = $('#live');
  if (live) {
    live.innerHTML = md(liveText);
    const box = $('#msgs');
    if (box.scrollHeight - box.scrollTop - box.clientHeight < 120) box.scrollTop = box.scrollHeight;
  }
});
window.api.onQuickAdd(() => { view = 'today'; renderChrome(); $('#view').innerHTML = viewToday(); $('#quick')?.focus(); });
window.api.onGoto((v) => { view = v; renderChrome(); $('#view').innerHTML = viewHours(); });

(async () => {
  S = await call('state');
  renderProfile();
  $('#view').innerHTML = viewToday();
  render();
  $('#quick')?.focus();
})();
