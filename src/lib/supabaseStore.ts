import type { SupabaseClient } from '@supabase/supabase-js'
import type { Pregunta, Progreso, SesionDiaria, Tema } from '../types'
import type { Store } from './store'
import { hoy } from './srs'

export function crearSupabaseStore(sb: SupabaseClient, userId: string): Store {
  const fallar = (error: unknown) => {
    if (error) throw error
  }

  return {
    modo: 'nube',

    async getTemas() {
      const { data, error } = await sb.from('temas').select('*').order('orden')
      fallar(error)
      return (data ?? []) as Tema[]
    },

    async getPreguntas(temaId) {
      let q = sb.from('preguntas').select('*')
      if (temaId) q = q.eq('tema_id', temaId)
      const { data, error } = await q
      fallar(error)
      return (data ?? []) as Pregunta[]
    },

    async getProgreso() {
      const { data, error } = await sb
        .from('progreso')
        .select('*')
        .eq('user_id', userId)
      fallar(error)
      const mapa: Record<string, Progreso> = {}
      for (const row of data ?? []) mapa[row.pregunta_id] = row as Progreso
      return mapa
    },

    async guardarProgreso(p) {
      const { error } = await sb.from('progreso').upsert({ ...p, user_id: userId })
      fallar(error)
    },

    async importarPack(pack) {
      if (pack.temas.length) {
        const { error } = await sb.from('temas').upsert(pack.temas)
        fallar(error)
      }
      // Lotes de 500 para no exceder el tamaño máximo de petición.
      for (let i = 0; i < pack.preguntas.length; i += 500) {
        const { error } = await sb.from('preguntas').upsert(pack.preguntas.slice(i, i + 500))
        fallar(error)
      }
      return { temas: pack.temas.length, preguntas: pack.preguntas.length }
    },

    async borrarTema(temaId) {
      // El esquema borra en cascada preguntas y progreso.
      const { error } = await sb.from('temas').delete().eq('id', temaId)
      fallar(error)
    },

    async borrarPreguntas(ids) {
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await sb.from('preguntas').delete().in('id', ids.slice(i, i + 200))
        fallar(error)
      }
    },

    async reiniciarProgreso(ids) {
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await sb
          .from('progreso')
          .delete()
          .eq('user_id', userId)
          .in('pregunta_id', ids.slice(i, i + 200))
        fallar(error)
      }
    },

    async getSesiones(desde) {
      const { data, error } = await sb
        .from('sesiones')
        .select('*')
        .eq('user_id', userId)
        .gte('fecha', desde)
        .order('fecha')
      fallar(error)
      return (data ?? []) as SesionDiaria[]
    },

    async acumularSesion(delta) {
      const fecha = hoy()
      const { data } = await sb
        .from('sesiones')
        .select('*')
        .eq('user_id', userId)
        .eq('fecha', fecha)
        .maybeSingle()
      const previo = (data as SesionDiaria | null) ?? {
        fecha,
        segundos: 0,
        respondidas: 0,
        aciertos: 0,
      }
      const { error } = await sb.from('sesiones').upsert({
        user_id: userId,
        fecha,
        segundos: previo.segundos + (delta.segundos ?? 0),
        respondidas: previo.respondidas + (delta.respondidas ?? 0),
        aciertos: previo.aciertos + (delta.aciertos ?? 0),
      })
      fallar(error)
    },
  }
}
