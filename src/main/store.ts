import fs from 'fs'
import path from 'path'
import type { DB } from '../shared/types'

/**
 * Almacén de persistencia. El resto de la app habla con los datos a través de `db.ts`;
 * `sqlite-store.ts` es la implementación que se usa en la actualidad.
 */
export interface Store {
  /** Ruta del almacén principal. Los ficheros auxiliares (p. ej. notas) cuelgan de su carpeta. */
  location(): string
  /** Carpeta de copias de seguridad. */
  backupsDir(): string
  /** true si el almacén todavía no tiene datos (primera ejecución o migración pendiente). */
  isNew(): boolean
  /** Devuelve los datos guardados, o {} si no existen. */
  read(): Partial<DB>
  /** Persiste el estado completo. */
  write(db: DB): void
  /** Copia puntual del almacén actual (p. ej. antes de importar). */
  snapshot(label: string): void
}

/** Lee el `data.json` de versiones anteriores. Solo sirve para migrar; devuelve {} si no existe o no se puede leer. */
export function readLegacyJson(userDataDir: string): Partial<DB> {
  try {
    return JSON.parse(fs.readFileSync(path.join(userDataDir, 'data.json'), 'utf8')) as Partial<DB>
  } catch {
    return {}
  }
}
