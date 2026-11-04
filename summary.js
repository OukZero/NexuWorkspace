// Resumen de lo trabajado en Claude durante una entrada de tiempo.
// Lee las transcripciones locales (~/.claude/projects/<carpeta>/*.jsonl) del proyecto de la tarea.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const projectsDir = () => path.join(os.homedir(), '.claude', 'projects');
const encodeFolder = (f) => f.replace(/[^a-zA-Z0-9]/g, '-');

function sessionFiles(folder, since) {
  const dir = path.join(projectsDir(), encodeFolder(path.resolve(folder)));
  try {
    return fs.readdirSync(dir)
      .filter((n) => n.endsWith('.jsonl'))
      .map((n) => path.join(dir, n))
      .filter((p) => fs.statSync(p).mtimeMs >= since);
  } catch {
    return [];
  }
}

// Extrae pedidos del usuario, respuestas de Claude y archivos tocados dentro de [from, to]
function digest(folder, from, to) {
  const asked = [], said = [], files = new Set();
  for (const file of sessionFiles(folder, from)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue;
      let o;
      try { o = JSON.parse(line); } catch { continue; }
      const ts = Date.parse(o.timestamp);
      if (!ts || ts < from || ts > to || o.isSidechain) continue;
      const parts = Array.isArray(o.message?.content) ? o.message.content : [{ type: 'text', text: o.message?.content || '' }];
      if (o.type === 'user') {
        for (const p of parts) {
          if (p.type !== 'text' || !p.text || p.text.startsWith('<')) continue; // ignora reminders/sistema
          asked.push(p.text.trim());
        }
      } else if (o.type === 'assistant') {
        for (const p of parts) {
          if (p.type === 'text' && p.text?.trim()) said.push(p.text.trim());
          if (p.type === 'tool_use' && ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(p.name) && p.input?.file_path) {
            files.add(path.relative(folder, p.input.file_path) || p.input.file_path);
          }
        }
      }
    }
  }
  return { asked, said, files: [...files] };
}

const clip = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);

function buildText(d) {
  const lines = [];
  d.asked.slice(0, 12).forEach((a) => lines.push('PEDIDO: ' + clip(a, 500)));
  d.said.slice(-8).forEach((a) => lines.push('CLAUDE: ' + clip(a, 600)));
  if (d.files.length) lines.push('ARCHIVOS MODIFICADOS: ' + d.files.slice(0, 40).join(', '));
  return clip(lines.join('\n'), 12000);
}

// resumen sin IA: siempre disponible
function localSummary(d) {
  const first = d.asked[0] ? clip(d.asked[0].replace(/\s+/g, ' '), 140) : 'Trabajo con Claude';
  const f = d.files.length ? ` Archivos: ${d.files.slice(0, 6).join(', ')}${d.files.length > 6 ? ` y ${d.files.length - 6} más` : ''}.` : '';
  return clip(`${first}.${f}`, 400);
}

// ejecuta `claude -p` con el prompt por stdin y devuelve la salida de texto
function askClaude(prompt, cmd, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(`${cmd} -p`, { shell: true, cwd: os.tmpdir(), windowsHide: true });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('timeout')); }, timeoutMs);
    child.stdout.on('data', (b) => (out += b));
    child.stderr.on('data', (b) => (err += b));
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      out.trim() && code === 0 ? resolve(out.trim()) : reject(new Error(err || 'sin salida'));
    });
    child.stdin.end(prompt);
  });
}

function aiSummary(text, cmd) {
  const prompt =
    'Resume en español, en 1 o 2 frases (máx. 250 caracteres), qué trabajo se hizo en esta sesión de programación, ' +
    'con un tono neutro apto para una imputación de horas. Responde SOLO con el resumen, sin comillas ni encabezados.\n\n' + text;
  return askClaude(prompt, cmd).then((out) => clip(out.replace(/\s+/g, ' '), 400));
}

// Resumen de una conversación del chat (lista de { role, text }) + archivos editados.
// Siempre intenta IA (el usuario lo pidió explícitamente) y cae a un resumen local si falla.
async function summarizeConversation({ messages, files, claudeCmd }) {
  const convo = messages.map((m) => (m.role === 'user' ? 'USUARIO: ' : 'CLAUDE: ') + clip(m.text.trim(), 900));
  let text = '';
  for (const l of convo.reverse()) { if ((text + l).length > 14000) break; text = l + '\n\n' + text; } // prioriza lo más reciente
  const fileLine = files.length ? `\n\nARCHIVOS MODIFICADOS: ${files.slice(0, 40).join(', ')}` : '';
  const prompt =
    'Resume en español qué se hizo en esta conversación de programación, para dejarlo como descripción del trabajo realizado en una tarea. ' +
    'Formato: entre 3 y 8 viñetas que empiecen con "- ", cada una en una línea, en pasado ("Se agregó…", "Se corrigió…"), concretas y sin relleno. ' +
    'Menciona archivos o módulos clave cuando aporte. Si quedó algo pendiente, añade al final una línea "Pendiente: …". ' +
    'Responde SOLO con las viñetas, sin encabezados ni comillas.\n\n' + text + fileLine;
  try {
    const out = await askClaude(prompt, claudeCmd, 180000);
    return { text: clip(out.replace(/\r/g, '').trim(), 3000), mode: 'ai' };
  } catch { /* cae al resumen local */ }
  const asked = messages.filter((m) => m.role === 'user').map((m) => '- ' + clip(m.text.replace(/\s+/g, ' ').trim(), 160));
  const f = files.length ? `\n- Archivos modificados: ${files.slice(0, 10).join(', ')}${files.length > 10 ? ` y ${files.length - 10} más` : ''}` : '';
  return { text: clip(asked.slice(0, 8).join('\n') + f, 3000), mode: 'local' };
}

// devuelve { text, mode } o null si no hubo actividad de Claude en ese rango
async function summarize({ folder, from, to, mode, claudeCmd }) {
  if (!folder || mode === 'off') return null;
  const d = digest(folder, from - 60000, to + 60000);
  if (!d.asked.length && !d.files.length) return null;
  if (mode === 'ai') {
    try {
      return { text: await aiSummary(buildText(d), claudeCmd), mode: 'ai' };
    } catch { /* cae al resumen local */ }
  }
  return { text: localSummary(d), mode: 'local' };
}

module.exports = { summarize, summarizeConversation };
