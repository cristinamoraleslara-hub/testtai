import type { Pregunta, Progreso } from '../types'

/** Días de espera por caja Leitner. Nivel 5 = dominada. */
const INTERVALOS = [0, 1, 2, 4, 8, 16]
export const NIVEL_DOMINADA = 5

export const hoy = () => new Date().toISOString().slice(0, 10)

const sumarDias = (dias: number) => {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function progresoInicial(pregunta_id: string): Progreso {
  return {
    pregunta_id,
    aciertos: 0,
    fallos: 0,
    nivel: 0,
    ultimo_resultado: null,
    proxima_revision: hoy(),
    actualizado: new Date().toISOString(),
  }
}

/**
 * Un fallo devuelve la pregunta a la caja 0 para que reaparezca ese mismo día:
 * el requisito es que lo fallado siga saliendo hasta dominarlo.
 */
export function aplicarRespuesta(previo: Progreso, acierto: boolean): Progreso {
  const nivel = acierto ? Math.min(previo.nivel + 1, NIVEL_DOMINADA) : 0
  return {
    ...previo,
    aciertos: previo.aciertos + (acierto ? 1 : 0),
    fallos: previo.fallos + (acierto ? 0 : 1),
    nivel,
    ultimo_resultado: acierto,
    proxima_revision: sumarDias(INTERVALOS[nivel] ?? 16),
    actualizado: new Date().toISOString(),
  }
}

export type Modo = 'mixto' | 'falladas' | 'nuevas'

const barajar = <T,>(xs: T[]): T[] => {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Ordena el pool de una sesión: primero lo fallado y vencido, luego lo nuevo,
 * y por último los repasos programados. Las dominadas cuya fecha aún no ha
 * llegado quedan fuera salvo que no haya nada más que preguntar.
 */
export function construirSesion(
  preguntas: Pregunta[],
  progreso: Record<string, Progreso>,
  modo: Modo,
  limite: number,
): Pregunta[] {
  const fecha = hoy()
  const falladas: Pregunta[] = []
  const nuevas: Pregunta[] = []
  const repasos: Pregunta[] = []
  const descansando: Pregunta[] = []

  for (const p of preguntas) {
    const pr = progreso[p.id]
    if (!pr) nuevas.push(p)
    else if (pr.ultimo_resultado === false || pr.nivel === 0) falladas.push(p)
    else if (pr.proxima_revision <= fecha) repasos.push(p)
    else descansando.push(p)
  }

  const seleccion =
    modo === 'falladas'
      ? [...barajar(falladas)]
      : modo === 'nuevas'
        ? [...barajar(nuevas)]
        : [...barajar(falladas), ...barajar(nuevas), ...barajar(repasos), ...barajar(descansando)]

  return seleccion.slice(0, limite)
}

export function resumen(preguntas: Pregunta[], progreso: Record<string, Progreso>) {
  let dominadas = 0
  let pendientes = 0
  let sinVer = 0
  for (const p of preguntas) {
    const pr = progreso[p.id]
    if (!pr) sinVer++
    else if (pr.nivel >= NIVEL_DOMINADA) dominadas++
    else pendientes++
  }
  return { total: preguntas.length, dominadas, pendientes, sinVer }
}
