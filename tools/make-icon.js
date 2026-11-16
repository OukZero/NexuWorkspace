// Genera los iconos de Nexu Workspace a partir de tools/icon.svg usando Electron (sin dependencias extra):
//   npm run icon
// Salidas: resources/icon.png (512), resources/nexo.ico (16–256), src/renderer/public/icon.png (128, marca del menú lateral).
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SVG = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8')
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const SIZES = [...new Set([...ICO_SIZES, 128, 512])]

// Se dibuja una vez a 512 px y el resto de tamaños se reducen de ahí.
async function renderBase() {
  const N = 512
  const win = new BrowserWindow({ show: false, width: N, height: N, useContentSize: true, frame: false, transparent: true, webPreferences: { offscreen: true } })
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${SVG.replace('width="256" height="256"', `width="${N}" height="${N}"`)}</body></html>`
  const tmp = path.join(os.tmpdir(), 'shutoki-icon.html')
  fs.writeFileSync(tmp, html)
  await win.loadFile(tmp)
  await new Promise((r) => setTimeout(r, 500))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: N, height: N })
  fs.unlinkSync(tmp)
  win.destroy()
  return img
}

// ICO con entradas PNG (Windows Vista+)
function ico(pngs) {
  const head = Buffer.alloc(6)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(pngs.length, 4)
  const dir = []
  let offset = 6 + 16 * pngs.length
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size
    e[1] = size >= 256 ? 0 : size
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    dir.push(e)
  }
  return Buffer.concat([head, ...dir, ...pngs.map((p) => p.data)])
}

app.whenReady().then(async () => {
  try {
    const png = {}
    const base = await renderBase()
    for (const s of SIZES) png[s] = (s === 512 ? base : base.resize({ width: s, height: s, quality: 'best' })).toPNG()
    fs.mkdirSync(path.join(ROOT, 'resources'), { recursive: true })
    fs.mkdirSync(path.join(ROOT, 'src', 'renderer', 'public'), { recursive: true })
    fs.writeFileSync(path.join(ROOT, 'resources', 'icon.png'), png[512])
    fs.writeFileSync(path.join(ROOT, 'resources', 'nexo.ico'), ico(ICO_SIZES.map((size) => ({ size, data: png[size] }))))
    fs.writeFileSync(path.join(ROOT, 'src', 'renderer', 'public', 'icon.png'), png[128])
    console.log('Iconos generados: resources/icon.png, resources/nexo.ico, src/renderer/public/icon.png')
    app.exit(0)
  } catch (e) {
    console.error(e)
    app.exit(1)
  }
})
