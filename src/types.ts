export type Tema = {
  id: string
  nombre: string
  descripcion: string
  orden: number
}

export type Pregunta = {
  id: string
  tema_id: string
  enunciado: string
  opciones: [string, string, string, string]
  correcta: 0 | 1 | 2 | 3
  explicacion: string
  fuente: string
}

export type Progreso = {
  pregunta_id: string
  aciertos: number
  fallos: number
  /** Caja Leitner 0-5. 5 = dominada. */
  nivel: number
  ultimo_resultado: boolean | null
  /** ISO date (YYYY-MM-DD) a partir de la cual vuelve a entrar en el pool. */
  proxima_revision: string
  actualizado: string
}

export type SesionDiaria = {
  fecha: string
  segundos: number
  respondidas: number
  aciertos: number
}

export type Pack = {
  temas: Tema[]
  preguntas: Pregunta[]
}
