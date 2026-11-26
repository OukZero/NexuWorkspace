import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'msedge' })
const p = await b.newPage({ viewport: { width: 1290, height: 560 } })
await p.goto('file:///C:/Users/marti/Nexu/NexuWorkspace/.tmp-vt/estilos/estilos.html')
await p.screenshot({ path: 'C:/Users/marti/Nexu/NexuWorkspace/.tmp-vt/estilos/estilos.png', fullPage: true })
await b.close()
