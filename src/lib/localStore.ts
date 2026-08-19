import type { Pregunta, Progreso, SesionDiaria, Tema } from '../types'
import { deduplicar, type Store } from './store'
import { hoy } from './srs'

const K = {
  temas: 'tai.temas',
  preguntas: 'tai.preguntas',
  progreso: 'tai.progreso',
  sesiones: 'tai.sesiones',
}

function leer<T>(clave: string, porDefecto: T): T {
  const raw = localStorage.getItem(clave)
  if (!raw) return porDefecto
  try {
    return JSON.parse(raw) as T
  } catch {
    return porDefecto
  }
}

const escribir = (clave: string, valor: unknown) =>
  localStorage.setItem(clave, JSON.stringify(valor))

export const localStore: Store = {
  modo: 'local',

  async getTemas() {
    return leer<Tema[]>(K.temas, []).sort((a, b) => a.orden - b.orden)
  },

  async getPreguntas(temaId) {
    const todas = leer<Pregunta[]>(K.preguntas, [])
    return temaId ? todas.filter((p) => p.tema_id === temaId) : todas
  },

  async getProgreso() {
    return leer<Record<string, Progreso>>(K.progreso, {})
  },

  async guardarProgreso(p) {
    const todo = leer<Record<string, Progreso>>(K.progreso, {})
    todo[p.pregunta_id] = p
    escribir(K.progreso, todo)
  },

  async importarPack(pack) {
    const temas = leer<Tema[]>(K.temas, [])
    for (const t of pack.temas) {
      const i = temas.findIndex((x) => x.id === t.id)
      if (i >= 0) temas[i] = { ...temas[i], ...t }
      else temas.push(t)
    }
    escribir(K.temas, temas)

    const preguntas = leer<Pregunta[]>(K.preguntas, [])
    const entrantes = deduplicar(pack.preguntas)
    for (const q of entrantes) {
      const i = preguntas.findIndex((x) => x.id === q.id)
      if (i >= 0) preguntas[i] = q
      else preguntas.push(q)
    }
    escribir(K.preguntas, preguntas)
    return { temas: pack.temas.length, preguntas: entrantes.length }
  },

  async borrarTema(temaId) {
    escribir(K.temas, leer<Tema[]>(K.temas, []).filter((t) => t.id !== temaId))
    const todas = leer<Pregunta[]>(K.preguntas, [])
    const aBorrar = todas.filter((p) => p.tema_id === temaId).map((p) => p.id)
    escribir(K.preguntas, todas.filter((p) => p.tema_id !== temaId))
    await localStore.borrarPreguntas(aBorrar)
  },

  async borrarPreguntas(ids) {
    const fuera = new Set(ids)
    escribir(K.preguntas, leer<Pregunta[]>(K.preguntas, []).filter((p) => !fuera.has(p.id)))
    const progreso = leer<Record<string, Progreso>>(K.progreso, {})
    for (const id of ids) delete progreso[id]
    escribir(K.progreso, progreso)
  },

  async reiniciarProgreso(ids) {
    const progreso = leer<Record<string, Progreso>>(K.progreso, {})
    for (const id of ids) delete progreso[id]
    escribir(K.progreso, progreso)
  },

  async getSesiones(desde) {
    return leer<SesionDiaria[]>(K.sesiones, [])
      .filter((s) => s.fecha >= desde)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
  },

  async acumularSesion(delta) {
    const sesiones = leer<SesionDiaria[]>(K.sesiones, [])
    const fecha = hoy()
    let s = sesiones.find((x) => x.fecha === fecha)
    if (!s) {
      s = { fecha, segundos: 0, respondidas: 0, aciertos: 0 }
      sesiones.push(s)
    }
    s.segundos += delta.segundos ?? 0
    s.respondidas += delta.respondidas ?? 0
    s.aciertos += delta.aciertos ?? 0
    escribir(K.sesiones, sesiones)
  },
}
