import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Pack, Pregunta, Progreso, SesionDiaria, Tema } from '../types'
import type { Store } from '../lib/store'
import { localStore } from '../lib/localStore'
import { crearSupabaseStore } from '../lib/supabaseStore'
import { supabase } from '../lib/supabase'
import { aplicarRespuesta, hoy, progresoInicial } from '../lib/srs'

type Datos = {
  store: Store
  listo: boolean
  email: string | null
  /** true cuando hay Supabase configurado pero nadie ha iniciado sesión. */
  necesitaAcceso: boolean
  sesionResuelta: boolean
  temas: Tema[]
  preguntas: Pregunta[]
  progreso: Record<string, Progreso>
  sesiones: SesionDiaria[]
  responder(preguntaId: string, acierto: boolean): Promise<void>
  sumarTiempo(segundos: number): Promise<void>
  importarPack(pack: Pack): Promise<{ temas: number; preguntas: number }>
  borrarTema(temaId: string): Promise<void>
  borrarPreguntas(ids: string[]): Promise<void>
  reiniciarProgreso(ids: string[]): Promise<void>
  recargar(): Promise<void>
}

const Ctx = createContext<Datos | null>(null)

const haceDias = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export function ProveedorDatos({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [sesionResuelta, setSesionResuelta] = useState(!supabase)

  const [listo, setListo] = useState(false)
  const [temas, setTemas] = useState<Tema[]>([])
  const [preguntas, setPreguntas] = useState<Pregunta[]>([])
  const [progreso, setProgreso] = useState<Record<string, Progreso>>({})
  const [sesiones, setSesiones] = useState<SesionDiaria[]>([])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null)
      setEmail(data.session?.user.email ?? null)
      setSesionResuelta(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUserId(s?.user.id ?? null)
      setEmail(s?.user.email ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const store = useMemo<Store>(
    () => (supabase && userId ? crearSupabaseStore(supabase, userId) : localStore),
    [userId],
  )

  const recargar = useCallback(async () => {
    const [t, p, pr, s] = await Promise.all([
      store.getTemas(),
      store.getPreguntas(),
      store.getProgreso(),
      store.getSesiones(haceDias(60)),
    ])
    setTemas(t)
    setPreguntas(p)
    setProgreso(pr)
    setSesiones(s)
    setListo(true)
  }, [store])

  useEffect(() => {
    if (!sesionResuelta) return
    setListo(false)
    recargar()
  }, [recargar, sesionResuelta])

  const responder = useCallback(
    async (preguntaId: string, acierto: boolean) => {
      const previo = progreso[preguntaId] ?? progresoInicial(preguntaId)
      const siguiente = aplicarRespuesta(previo, acierto)
      setProgreso((p) => ({ ...p, [preguntaId]: siguiente }))
      setSesiones((ss) => {
        const fecha = hoy()
        const resto = ss.filter((s) => s.fecha !== fecha)
        const actual = ss.find((s) => s.fecha === fecha) ?? {
          fecha,
          segundos: 0,
          respondidas: 0,
          aciertos: 0,
        }
        return [
          ...resto,
          {
            ...actual,
            respondidas: actual.respondidas + 1,
            aciertos: actual.aciertos + (acierto ? 1 : 0),
          },
        ].sort((a, b) => a.fecha.localeCompare(b.fecha))
      })
      await store.guardarProgreso(siguiente)
      await store.acumularSesion({ respondidas: 1, aciertos: acierto ? 1 : 0 })
    },
    [progreso, store],
  )

  const sumarTiempo = useCallback(
    async (segundos: number) => {
      setSesiones((ss) => {
        const fecha = hoy()
        const resto = ss.filter((s) => s.fecha !== fecha)
        const actual = ss.find((s) => s.fecha === fecha) ?? {
          fecha,
          segundos: 0,
          respondidas: 0,
          aciertos: 0,
        }
        return [...resto, { ...actual, segundos: actual.segundos + segundos }].sort((a, b) =>
          a.fecha.localeCompare(b.fecha),
        )
      })
      await store.acumularSesion({ segundos })
    },
    [store],
  )

  const importarPack = useCallback(
    async (pack: Pack) => {
      const r = await store.importarPack(pack)
      await recargar()
      return r
    },
    [recargar, store],
  )

  const borrarTema = useCallback(
    async (temaId: string) => {
      await store.borrarTema(temaId)
      await recargar()
    },
    [recargar, store],
  )

  const borrarPreguntas = useCallback(
    async (ids: string[]) => {
      await store.borrarPreguntas(ids)
      await recargar()
    },
    [recargar, store],
  )

  const reiniciarProgreso = useCallback(
    async (ids: string[]) => {
      await store.reiniciarProgreso(ids)
      await recargar()
    },
    [recargar, store],
  )

  const valor: Datos = {
    store,
    listo,
    email,
    necesitaAcceso: supabase !== null && userId === null,
    sesionResuelta,
    temas,
    preguntas,
    progreso,
    sesiones,
    responder,
    sumarTiempo,
    importarPack,
    borrarTema,
    borrarPreguntas,
    reiniciarProgreso,
    recargar,
  }

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useDatos() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDatos fuera de ProveedorDatos')
  return ctx
}
