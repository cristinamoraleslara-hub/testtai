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

const normalizar = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * id determinista: reimportar la misma pregunta la actualiza en vez de
 * duplicarla, conservando el progreso.
 *
 * Entran también las opciones, y no por capricho: en los exámenes oficiales
 * hay enunciados perezosos como «Señale la respuesta correcta:» que aparecen
 * dos veces en la misma convocatoria hablando de cosas distintas, y preguntas
 * repetidas entre años con opciones —y respuesta correcta— diferentes. Con el
 * enunciado solo, esas se pisaban entre ellas.
 */
export function idPregunta(temaId: string, enunciado: string, opciones: string[] = []): string {
  const base = `${temaId}::${normalizar(enunciado)}::${opciones.map(normalizar).join('|')}`
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < base.length; i++) {
    h1 = Math.imul(h1 ^ base.charCodeAt(i), 0x01000193) >>> 0
    h2 = Math.imul(h2 + base.charCodeAt(i) + 0x9e3779b9, 0x85ebca6b) >>> 0
  }
  return `q_${h1.toString(36)}${h2.toString(36)}`
}

/**
 * Deja una sola pregunta por id. Postgres rechaza un upsert que traiga el
 * mismo id dos veces en la misma orden («ON CONFLICT DO UPDATE command cannot
 * affect row a second time»), así que esto no es cosmética: sin ello, un
 * archivo con una pregunta literalmente repetida rompe la importación entera.
 */
export function deduplicar(preguntas: Pregunta[]): Pregunta[] {
  const vistas = new Map<string, Pregunta>()
  for (const p of preguntas) vistas.set(p.id, p)
  return [...vistas.values()]
}

export const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'tema'
