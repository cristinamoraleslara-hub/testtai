import type { Pregunta } from '../types'

/** Generador con semilla (mulberry32): misma semilla, misma baraja. */
function aleatorio(semilla: number) {
  return () => {
    semilla = (semilla + 0x6d2b79f5) | 0
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const semillaDe = (texto: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 0x01000193) >>> 0
  return h
}

/** Una semilla nueva por tanda: recoloca las opciones de una vez a la otra. */
export const nuevaSemilla = () => (Math.random() * 2 ** 32) >>> 0

export type Barajada = {
  opciones: string[]
  /** Posición que ocupa la respuesta correcta tras recolocar. */
  correcta: number
}

/**
 * Recoloca las opciones para que memorices la respuesta y no su posición.
 *
 * El orden sale de la pregunta más la semilla de la sesión, y no de
 * Math.random: así cambia en cada tanda pero se mantiene estable dentro de
 * ella. Con un barajado al azar bastaría con que React recalculase el valor
 * memorizado —cosa que no garantiza conservar— para que las opciones se
 * recolocaran justo después de responder y diera por fallada una acertada.
 */
export function barajarOpciones(p: Pregunta, semillaSesion: number): Barajada {
  const rnd = aleatorio(semillaDe(p.id) ^ semillaSesion)
  const orden = [0, 1, 2, 3]
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[orden[i], orden[j]] = [orden[j], orden[i]]
  }
  return {
    opciones: orden.map((i) => p.opciones[i]),
    // Dónde ha caído la que era correcta en el orden original.
    correcta: orden.indexOf(p.correcta),
  }
}
