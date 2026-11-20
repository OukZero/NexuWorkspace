import { dialog, shell } from 'electron'
import ExcelJS from 'exceljs'
import { dayKey } from '../../../shared/util'
import { getDb } from '../../db'
import { getMain } from '../../windows'

interface Row {
  day: string
  client: string
  project: string
  title: string
  hours: number
  notes: string[]
}

export async function exportExcel(from: string, to: string): Promise<string | null> {
  const db = getDb()
  const f = new Date(from + 'T00:00:00').getTime()
  const t = new Date(to + 'T23:59:59').getTime()
  // agrupar por día + tarea
  const grouped = new Map<string, Row>()
  for (const e of db.entries) {
    if (!e.end || e.start < f || e.start > t) continue
    const task = db.tasks.find((x) => x.id === e.taskId)
    if (!task) continue
    const day = dayKey(new Date(e.start))
    const k = [day, task.client, task.project, task.title].join('|')
    const g = grouped.get(k) ?? { day, client: task.client || '', project: task.project || '', title: task.title, hours: 0, notes: [] }
    g.hours += Math.round(((e.end - e.start) / 3600000) * 100) / 100
    if (e.note) g.notes.push(e.note)
    grouped.set(k, g)
  }
  const list = [...grouped.values()].sort((a, b) => a.day.localeCompare(b.day))

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Horas')
  ws.columns = [
    { header: 'Fecha', key: 'day', width: 12 },
    { header: 'Cliente', key: 'client', width: 22 },
    { header: 'Proyecto', key: 'project', width: 24 },
    { header: 'Tarea', key: 'title', width: 44 },
    { header: 'Descripción', key: 'desc', width: 50 },
    { header: 'Horas', key: 'hours', width: 9 }
  ]
  ws.getRow(1).font = { bold: true }
  for (const g of list) ws.addRow({ ...g, desc: g.notes.join('; '), hours: Math.round(g.hours * 100) / 100 })
  const last = ws.rowCount
  ws.addRow({ title: 'TOTAL', hours: { formula: `SUM(F2:F${Math.max(last, 2)})` } }).font = { bold: true }
  ws.getColumn('hours').numFmt = '0.00'
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  const opts = { defaultPath: `horas_${from}_${to}.xlsx`, filters: [{ name: 'Excel', extensions: ['xlsx'] }] }
  const main = getMain()
  const res = main ? await dialog.showSaveDialog(main, opts) : await dialog.showSaveDialog(opts)
  if (res.canceled || !res.filePath) return null
  await wb.xlsx.writeFile(res.filePath)
  shell.showItemInFolder(res.filePath)
  return res.filePath
}
