// Genera el icono de Shutoki sin dependencias: node tools/make-icon.js
// Diseño: sello rojo (hanko) inclinado sobre fondo índigo; anillo abierto (tiempo) + check que sale por la abertura (tarea hecha).
// Salidas: resources/icon.png (512), resources/icon.ico (16–256), src/renderer/public/icon.png (128, para la marca del sidebar).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// distancias con signo (negativo = dentro)
const sdRoundBox = (px, py, hx, hy, r) => {
  const qx = Math.abs(px) - hx + r, qy = Math.abs(py) - hy + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const sdSeg = (px, py, ax, ay, bx, by) => {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay));
  return Math.hypot(pax - bax * h, pay - bay * h);
};
const hash = (x, y) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

const BG_TOP = hex('#222842'), BG_BOT = hex('#0c0e15');
const RED_TOP = hex('#ff6150'), RED_BOT = hex('#cf2e2a');
const IVORY = hex('#fff1e0');
const TILT = (-6 * Math.PI) / 180;
const GAP_ANGLE = -Math.PI / 3; // la abertura del anillo apunta arriba a la derecha, por donde sale el check

function shade(x, y, detail) {
  let c = [0, 0, 0, 0];
  const over = (col, a) => {
    const oa = a + c[3] * (1 - a);
    if (oa <= 0) return;
    c = [0, 1, 2].map((i) => (col[i] * a + c[i] * c[3] * (1 - a)) / oa).concat(oa);
  };

  if (sdRoundBox(x - 0.5, y - 0.5, 0.5, 0.5, 0.22) < 0) over(mix(BG_TOP, BG_BOT, y), 1);

  // coordenadas locales del sello (girado)
  const dx = x - 0.5, dy = y - 0.5;
  const sx = dx * Math.cos(TILT) + dy * Math.sin(TILT);
  const sy = -dx * Math.sin(TILT) + dy * Math.cos(TILT);

  const dSeal = sdRoundBox(sx, sy, 0.315, 0.315, 0.075);
  let inSeal = dSeal < 0;
  if (inSeal && detail) {
    // borde irregular y alguna falla de tinta, como un sello real
    const n = hash(Math.floor(x * 90), Math.floor(y * 90));
    if (n > 0.985 || (dSeal > -0.012 && n > 0.8)) inSeal = false;
  }
  if (!inSeal) return c;
  over(mix(RED_TOP, RED_BOT, clamp(sy + 0.5)), 1);

  // anillo abierto
  const r = Math.hypot(sx, sy);
  let da = Math.atan2(sy, sx) - GAP_ANGLE;
  da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
  const onRing = Math.abs(r - 0.19) < 0.021 && da > 0.3;
  // check que atraviesa la abertura
  const dTick = Math.min(sdSeg(sx, sy, -0.095, 0.005, -0.03, 0.075), sdSeg(sx, sy, -0.03, 0.075, 0.15, -0.14)) - 0.024;
  if (onRing || dTick < 0) over(IVORY, 1);
  else if (detail && hash(Math.floor(x * 70) + 7, Math.floor(y * 70)) > 0.975) over(IVORY, 0.35); // motas de tinta
  return c;
}

function render(size) {
  const N = 4, detail = size >= 64;
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let R = 0, G = 0, B = 0, A = 0;
      for (let sj = 0; sj < N; sj++) {
        for (let si = 0; si < N; si++) {
          const s = shade((i + (si + 0.5) / N) / size, (j + (sj + 0.5) / N) / size, detail);
          R += s[0] * s[3]; G += s[1] * s[3]; B += s[2] * s[3]; A += s[3];
        }
      }
      const o = (j * size + i) * 4;
      if (A > 0) { px[o] = (R / A) * 255; px[o + 1] = (G / A) * 255; px[o + 2] = (B / A) * 255; px[o + 3] = (A / (N * N)) * 255; }
    }
  }
  return px;
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function png(size) {
  const px = render(size);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let j = 0; j < size; j++) px.copy(raw, j * (size * 4 + 1) + 1, j * size * 4, (j + 1) * size * 4);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function ico(sizes) {
  const imgs = sizes.map((s) => ({ s, data: png(s) }));
  const head = Buffer.alloc(6 + 16 * imgs.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
  let off = head.length;
  imgs.forEach(({ s, data }, i) => {
    const e = 6 + 16 * i;
    head[e] = s >= 256 ? 0 : s; head[e + 1] = s >= 256 ? 0 : s;
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(off, e + 12);
    off += data.length;
  });
  return Buffer.concat([head, ...imgs.map((i) => i.data)]);
}

const PUBLIC = path.join(ROOT, 'src', 'renderer', 'public');
fs.mkdirSync(path.join(ROOT, 'resources'), { recursive: true });
fs.mkdirSync(PUBLIC, { recursive: true });
fs.writeFileSync(path.join(ROOT, 'resources', 'icon.png'), png(512));
fs.writeFileSync(path.join(ROOT, 'resources', 'icon.ico'), ico([16, 24, 32, 48, 64, 128, 256]));
fs.writeFileSync(path.join(PUBLIC, 'icon.png'), png(128));
console.log('Iconos generados en resources/ y src/renderer/public/');
