const call = window.api.call;
const pad = (n) => String(n).padStart(2, '0');
const fmt = (ms) => { const s = Math.floor(ms / 1000); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; };
let S = null;
let flash = null; // { text, until } mensaje de error temporal
const $ = (id) => document.getElementById(id);

const ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
const ICON_STOP = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

// tarea a la que van los mensajes: la del timer activo, la pausada o, si no hay, la del último chat usado
function targetTask() {
  const a = S.entries.find((e) => !e.end);
  let id = a ? a.taskId : S.paused;
  if (!id) {
    let best = 0;
    for (const [tid, c] of Object.entries(S.chats || {})) {
      const ts = c.messages?.length ? c.messages[c.messages.length - 1].ts : 0;
      if (ts > best && S.tasks.some((t) => t.id === tid && t.status !== 'done')) { best = ts; id = tid; }
    }
  }
  return S.tasks.find((x) => x.id === id) || null;
}

function draw() {
  if (!S) return;
  const a = S.entries.find((e) => !e.end);
  const t = targetTask();
  const chat = t && S.chats?.[t.id];
  const running = !!chat?.running;
  $('dot').classList.toggle('off', !a);
  $('name').innerHTML = '';
  const title = document.createElement('div');
  title.textContent = t ? t.title : 'Sin tarea activa';
  const sub = document.createElement('small');
  if (flash && flash.until > Date.now()) { sub.textContent = flash.text; sub.className = 'err'; }
  else if (running) sub.textContent = 'Claude está respondiendo…';
  else sub.textContent = a ? (t.project || 'en curso') : t ? (S.paused === t.id ? 'En pausa' : 'Último chat') : 'Abre la app para elegir una tarea';
  $('name').append(title, sub);
  $('t').textContent = a ? fmt(Date.now() - a.start) : '';
  $('toggle').textContent = a ? '⏸' : '▶';
  const vis = a || S.paused ? 'visible' : 'hidden';
  $('toggle').style.visibility = vis;
  $('stop').style.visibility = vis;

  const input = $('msg');
  const wasDisabled = input.disabled;
  input.disabled = !t || running;
  if (wasDisabled && !input.disabled && document.hasFocus()) input.focus(); // Claude terminó: listo para la siguiente instrucción
  input.placeholder = !t ? 'Sin tarea para enviar mensajes' : running ? 'Claude está trabajando…' : 'Escribe una instrucción para Claude…';
  const send = $('send');
  send.classList.toggle('stop', running);
  send.title = running ? 'Detener respuesta' : 'Enviar (Enter)';
  const html = running ? ICON_STOP : ICON_SEND;
  if (send.dataset.i !== (running ? 's' : 'a')) { send.innerHTML = html; send.dataset.i = running ? 's' : 'a'; }
  send.disabled = !t || (!running && !input.value.trim());
}

function showError(text) { flash = { text, until: Date.now() + 5000 }; draw(); }

$('form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const t = targetTask();
  if (!t) return;
  if (S.chats?.[t.id]?.running) { call('chat:cancel', t.id).catch((e) => showError(e.message)); return; }
  const text = $('msg').value.trim();
  if (!text) return;
  $('msg').value = '';
  draw();
  try { await call('chat:send', t.id, text); } catch (e) { $('msg').value = text; showError(e.message); draw(); }
});
$('msg').addEventListener('input', draw);
$('toggle').onclick = () => call(S.entries.some((e) => !e.end) ? 'timer:pause' : 'timer:resume');
$('stop').onclick = () => call('timer:stop');
$('open').onclick = () => call('win:restore');
window.api.onState((s) => { S = s; draw(); });
call('state').then((s) => { S = s; draw(); });
setInterval(draw, 1000);
