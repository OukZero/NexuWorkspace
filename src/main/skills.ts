// Skills oficiales de Anthropic (repositorio público anthropics/skills): listar, instalar y quitar.
// Se instalan en ~/.claude/skills, la carpeta donde Claude Code busca las skills personales.
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { SkillInfo } from '../shared/types'

const REPO = 'anthropics/skills'
const BRANCH = 'main'
const dirOf = (): string => path.join(os.homedir(), '.claude', 'skills')
const valid = (n: string): boolean => /^[a-z0-9][a-z0-9._-]*$/i.test(n)

interface TreeItem {
  path: string
  type: 'blob' | 'tree'
}
let cache: { at: number; items: TreeItem[] } | null = null

async function tree(): Promise<TreeItem[]> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.items
  const r = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`, { headers: { 'User-Agent': 'shutoki-ai-workspace', Accept: 'application/vnd.github+json' } })
  if (!r.ok) throw new Error(`No se pudo consultar el catálogo de skills (HTTP ${r.status}). Revisa tu conexión.`)
  const items = ((await r.json()) as { tree: TreeItem[] }).tree.filter((i) => i.path.startsWith('skills/'))
  cache = { at: Date.now(), items }
  return items
}

const raw = async (p: string): Promise<Buffer> => {
  const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/${p.split('/').map(encodeURIComponent).join('/')}`)
  if (!r.ok) throw new Error(`No se pudo descargar ${p} (HTTP ${r.status})`)
  return Buffer.from(await r.arrayBuffer())
}

/** Lee `name` y `description` del encabezado YAML de un SKILL.md. */
function front(md: string): { name?: string; description: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md)
  const body = m?.[1] ?? ''
  const get = (k: string): string => {
    const x = new RegExp(`^${k}:\s*(.*)$`, 'm').exec(body)
    if (!x) return ''
    let v = x[1].trim()
    if (/^[>|][+-]?$/.test(v)) {
      const rest = body.slice((x.index ?? 0) + x[0].length).split(/\r?\n/).slice(1)
      const lines: string[] = []
      for (const l of rest) {
        if (/^\s+\S/.test(l)) lines.push(l.trim())
        else break
      }
      v = lines.join(' ')
    }
    return v.replace(/^["']|["']$/g, '')
  }
  return { name: get('name') || undefined, description: get('description') }
}

const installed = (): Set<string> => {
  try {
    return new Set(fs.readdirSync(dirOf(), { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(dirOf(), d.name, 'SKILL.md'))).map((d) => d.name))
  } catch {
    return new Set()
  }
}

export async function listSkills(): Promise<SkillInfo[]> {
  const items = await tree()
  const names = [...new Set(items.filter((i) => i.type === 'blob' && /^skills\/[^/]+\/SKILL\.md$/.test(i.path)).map((i) => i.path.split('/')[1]))]
  const have = installed()
  const out = await Promise.all(
    names.map(async (name): Promise<SkillInfo> => {
      let description = ''
      try {
        description = front((await raw(`skills/${name}/SKILL.md`)).toString('utf8')).description
      } catch {
        /* sin descripción */
      }
      return { name, description, installed: have.has(name) }
    })
  )
  // las que ya tienes instaladas pero no son oficiales (propias) también se muestran, para poder quitarlas
  for (const n of have) if (!names.includes(n)) out.push({ name: n, description: front(fs.readFileSync(path.join(dirOf(), n, 'SKILL.md'), 'utf8')).description, installed: true, custom: true })
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export async function installSkill(name: string): Promise<string> {
  if (!valid(name)) throw new Error('Nombre de skill no válido')
  const files = (await tree()).filter((i) => i.type === 'blob' && i.path.startsWith(`skills/${name}/`))
  if (!files.length) throw new Error('Esa skill no existe en el catálogo oficial')
  const dest = path.join(dirOf(), name)
  const tmp = `${dest}.tmp-${Date.now()}`
  try {
    for (const f of files) {
      const rel = f.path.slice(`skills/${name}/`.length)
      const target = path.join(tmp, rel)
      if (!path.resolve(target).startsWith(path.resolve(tmp) + path.sep)) continue
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, await raw(f.path))
    }
    fs.rmSync(dest, { recursive: true, force: true })
    fs.renameSync(tmp, dest)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  return `Skill «${name}» instalada (${files.length} archivo${files.length > 1 ? 's' : ''}). Las conversaciones nuevas ya la pueden usar.`
}

export function removeSkill(name: string): string {
  if (!valid(name)) throw new Error('Nombre de skill no válido')
  fs.rmSync(path.join(dirOf(), name), { recursive: true, force: true })
  return `Skill «${name}» quitada.`
}
