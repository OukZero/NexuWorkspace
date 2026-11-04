// Chat por tarea: ejecuta `claude -p` (stream-json) en la carpeta del proyecto y reanuda la sesión de la tarea.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const MAX_ACTIVITY = 300;
const HUNK_MAX = 4000;
const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; };

// errores de sesión de Claude Code (login vencido, sin autenticar, token inválido)
const AUTH_RE = /authenticat|auth login|setup-token|OAUTH_TOKEN|not logged in|please run \/?login|invalid api key|credentials/i;
const sysMsg = (text) => ({ role: 'system', text: clip(text, 500), ts: Date.now(), ...(AUTH_RE.test(text) ? { action: 'login' } : {}) });

function createChat(ctx) {
  const procs = new Map(); // taskId -> child

  function chatOf(taskId) {
    const db = ctx.db();
    db.chats = db.chats || {};
    return (db.chats[taskId] = db.chats[taskId] || { sessionId: null, messages: [], activity: [], running: false });
  }

  function describe(block, folder) {
    const i = block.input || {};
    const rel = (p) => {
      if (!p) return '';
      const r = path.relative(folder, p);
      return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : p;
    };
    // fragmentos antes/después para poder ver qué cambió (recortados para no inflar data.json)
    const hunk = (o, n) => ({ old: o == null ? null : clip(o, HUNK_MAX), new: clip(n, HUNK_MAX) });
    switch (block.name) {
      case 'Edit': return { kind: 'edit', label: 'Editó', target: rel(i.file_path), hunks: [hunk(i.old_string, i.new_string)] };
      case 'MultiEdit': return { kind: 'edit', label: 'Editó', target: rel(i.file_path), hunks: (i.edits || []).slice(0, 30).map((e) => hunk(e.old_string, e.new_string)) };
      case 'Write': return { kind: 'edit', label: 'Escribió', target: rel(i.file_path), hunks: [hunk(null, i.content)] };
      case 'NotebookEdit': return { kind: 'edit', label: 'Editó', target: rel(i.notebook_path), hunks: [hunk(null, i.new_source)] };
      case 'Read': return { kind: 'read', label: 'Leyó', target: rel(i.file_path) };
      case 'Bash': return { kind: 'run', label: 'Ejecutó', target: clip(i.command, 160) };
      case 'Grep': return { kind: 'search', label: 'Buscó', target: clip(i.pattern, 100) };
      case 'Glob': return { kind: 'search', label: 'Listó', target: clip(i.pattern, 100) };
      case 'WebFetch': return { kind: 'other', label: 'Abrió', target: clip(i.url, 120) };
      case 'WebSearch': return { kind: 'other', label: 'Buscó en la web', target: clip(i.query, 100) };
      default: return { kind: 'other', label: block.name, target: '' };
    }
  }

  function handle(taskId, folder, ev) {
    const chat = chatOf(taskId);
    if (ev.session_id && !chat.sessionId) chat.sessionId = ev.session_id;

    if (ev.type === 'stream_event') {
      const d = ev.event?.delta;
      if (ev.event?.type === 'content_block_delta' && d?.type === 'text_delta') ctx.emit('chat:delta', { taskId, text: d.text });
      return;
    }
    if (ev.type === 'assistant') {
      for (const b of ev.message?.content || []) {
        if (b.type === 'text' && b.text?.trim()) chat.messages.push({ role: 'assistant', text: b.text.trim(), ts: Date.now() });
        if (b.type === 'tool_use') {
          chat.activity.push({ id: b.id, ts: Date.now(), tool: b.name, status: 'running', ...describe(b, folder) });
          if (chat.activity.length > MAX_ACTIVITY) chat.activity.splice(0, chat.activity.length - MAX_ACTIVITY);
        }
      }
      ctx.push();
      return;
    }
    if (ev.type === 'user') {
      for (const b of ev.message?.content || []) {
        if (b.type !== 'tool_result') continue;
        const a = chat.activity.find((x) => x.id === b.tool_use_id);
        if (!a) continue;
        a.status = b.is_error ? 'error' : 'ok';
        if (b.is_error) {
          const txt = Array.isArray(b.content) ? b.content.map((c) => c.text || '').join(' ') : b.content;
          a.detail = clip(txt, 200);
        }
      }
      ctx.push();
      return;
    }
    if (ev.type === 'result') {
      chat.gotResult = true;
      if (ev.is_error) chat.messages.push(sysMsg(ev.result || ev.subtype || 'Error de Claude'));
      ctx.push();
    }
  }

  function send(taskId, text) {
    const db = ctx.db();
    const task = db.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error('Tarea no encontrada');
    if (!task.folder || !fs.existsSync(task.folder)) throw new Error('Asigna una carpeta de proyecto válida a la tarea para chatear.');
    text = String(text || '').trim();
    if (!text) return;
    const chat = chatOf(taskId);
    if (chat.running) throw new Error('Claude sigue respondiendo en esta tarea.');

    chat.messages.push({ role: 'user', text, ts: Date.now() });
    chat.running = true;
    chat.gotResult = false;
    ctx.ensureTimer(taskId);
    ctx.commit();

    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--permission-mode', 'acceptEdits'];
    if (chat.sessionId) args.push('--resume', chat.sessionId);
    const child = spawn(`${db.settings.claudeCmd} ${args.join(' ')}`, { shell: true, cwd: task.folder, windowsHide: true });
    procs.set(taskId, child);

    let buf = '', err = '';
    child.stdout.on('data', (b) => {
      buf += b;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        try { handle(taskId, task.folder, JSON.parse(line)); } catch { /* línea no JSON */ }
      }
    });
    child.stderr.on('data', (b) => (err += b));
    child.stdin.on('error', () => {});
    child.stdin.end(text);

    const finish = (code, spawnErr) => {
      if (procs.get(taskId) !== child) return;
      procs.delete(taskId);
      chat.running = false;
      for (const a of chat.activity) if (a.status === 'running') a.status = chat.cancelled ? 'error' : 'ok';
      if (chat.cancelled) chat.messages.push({ role: 'system', text: 'Respuesta cancelada.', ts: Date.now() });
      else if (spawnErr || (code !== 0 && !chat.gotResult)) {
        chat.messages.push(sysMsg(spawnErr?.message || err.trim() || `claude terminó con código ${code}. ¿Responde "${db.settings.claudeCmd} --version" en PowerShell?`));
      }
      chat.cancelled = false;
      ctx.commit();
    };
    child.on('error', (e) => finish(1, e));
    child.on('close', (code) => finish(code));
  }

  function cancel(taskId) {
    const child = procs.get(taskId);
    if (!child) return;
    chatOf(taskId).cancelled = true;
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  }

  function reset(taskId) {
    if (procs.has(taskId)) throw new Error('Espera a que termine o cancela la respuesta.');
    ctx.db().chats[taskId] = { sessionId: null, messages: [], activity: [], running: false };
    ctx.commit();
  }

  function killAll() {
    for (const c of procs.values()) spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { windowsHide: true });
  }

  return { send, cancel, reset, killAll };
}

module.exports = { createChat };
