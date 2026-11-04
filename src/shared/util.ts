export const pad = (n: number): string => String(n).padStart(2, '0')

export const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const clip = (s: unknown, n: number): string => {
  const str = String(s ?? '')
  return str.length > n ? str.slice(0, n) + '…' : str
}
