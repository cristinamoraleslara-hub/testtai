import type { Pack, Pregunta, Progreso, SesionDiaria, Tema } from '../types.ts'

export type Store = {
  modo: 'local' | 'nube'
  getTemas(): Promise<Tema[]>
  getPreguntas(temaId?: string): Promise<Pregunta[]>
  getProgreso(): Promise<Record<string, Progreso>>
  guardarProgreso(p: Progreso): Promise<void>
  /** Fusiona un pack sin tocar el progreso existente. */
  importarPack(pack: Pack): Promise<{ temas: number; preguntas: number }>
  borrarTema(temaId: string): Promise<void>
  /** Borra preguntas concretas y, con ellas, su progreso. */
  borrarPreguntas(ids: string[]): Promise<void>
  /** Conserva las preguntas y pone a cero aciertos, fallos y cajas. */
  reiniciarProgreso(ids: string[]): Promise<void>
  getSesiones(desde: string): Promise<SesionDiaria[]>
  acumularSesion(delta: { segundos?: number; respondidas?: number; aciertos?: number }): Promise<void>
}

/** id determinista: reimportar el mismo enunciado actualiza, no duplica. */
export function idPregunta(temaId: string, enunciado: string): string {
  const base = `${temaId}::${enunciado.trim().toLowerCase().replace(/\s+/g, ' ')}`
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < base.length; i++) {
    h1 = Math.imul(h1 ^ base.charCodeAt(i), 0x01000193) >>> 0
    h2 = Math.imul(h2 + base.charCodeAt(i) + 0x9e3779b9, 0x85ebca6b) >>> 0
  }
  return `q_${h1.toString(36)}${h2.toString(36)}`
}

export const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'tema'
