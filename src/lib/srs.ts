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

export type Modo = 'mixto' | 'falladas' | 'nuevas' | 'repaso'

const barajar = <T,>(xs: T[]): T[] => {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Reparte las preguntas en los cuatro estados de la caja de Leitner.
 *
 * «Repaso» son las que ya has acertado alguna vez y les toca hoy; «descansando»
 * las acertadas cuya fecha aún no ha llegado.
 */
export function clasificar(preguntas: Pregunta[], progreso: Record<string, Progreso>) {
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
  return { falladas, nuevas, repasos, descansando }
}

/**
 * Ordena el pool de una sesión.
 *
 * En «mixto» los repasos vencidos van ANTES que las preguntas nuevas, y no es
 * un detalle: con un banco de varios cientos de preguntas, las nuevas llenaban
 * la tanda entera y lo ya acertado no volvía a salir nunca, con lo que la
 * repetición espaciada dejaba de existir. Un repaso vencido caduca; una
 * pregunta nueva puede esperar a mañana.
 */
export function construirSesion(
  preguntas: Pregunta[],
  progreso: Record<string, Progreso>,
  modo: Modo,
  limite: number,
): Pregunta[] {
  const { falladas, nuevas, repasos, descansando } = clasificar(preguntas, progreso)

  // Por fecha: primero lo que lleva más tiempo esperando.
  const porAntiguedad = (xs: Pregunta[]) =>
    [...xs].sort((a, b) =>
      (progreso[a.id]?.proxima_revision ?? '').localeCompare(progreso[b.id]?.proxima_revision ?? ''),
    )

  const seleccion =
    modo === 'falladas'
      ? barajar(falladas)
      : modo === 'nuevas'
        ? barajar(nuevas)
        : modo === 'repaso'
          ? // Si hoy no toca ninguna, se adelantan las más próximas en vez de
            // dejarte con la pantalla vacía cuando quieres repasar.
            [...barajar(repasos), ...porAntiguedad(descansando)]
          : [...barajar(falladas), ...barajar(repasos), ...barajar(nuevas), ...barajar(descansando)]

  return seleccion.slice(0, limite)
}

/**
 * Recuento de un conjunto de preguntas.
 *
 * `falladas + acertadas + sinVer` suma siempre el total; `dominadas` es un
 * subconjunto de `acertadas`. Se distinguen a propósito: «dominada» exige
 * cinco aciertos espaciados y tarda semanas, así que por sí sola parece que
 * estudiar no cuenta para nada.
 */
export function resumen(preguntas: Pregunta[], progreso: Record<string, Progreso>) {
  const { falladas, nuevas, repasos, descansando } = clasificar(preguntas, progreso)
  const dominadas = preguntas.filter(
    (p) => (progreso[p.id]?.nivel ?? 0) >= NIVEL_DOMINADA,
  ).length

  return {
    total: preguntas.length,
    /** Nunca te han salido. */
    sinVer: nuevas.length,
    /** Falladas, o vistas y aún sin acertar: vuelven hoy. */
    falladas: falladas.length,
    /** Acertadas al menos una vez y no falladas después. */
    acertadas: repasos.length + descansando.length,
    /** Acertadas a las que hoy les toca volver a salir. */
    repasoHoy: repasos.length,
    dominadas,
  }
}
