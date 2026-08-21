import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDatos } from '../hooks/useDatos'
import { MetaDiaria } from '../components/MetaDiaria'
import { NIVEL_DOMINADA, clasificar, resumen, type Modo } from '../lib/srs'

const MODOS: { id: Modo; texto: string; ayuda: string }[] = [
  { id: 'mixto', texto: 'Mixto', ayuda: 'Falladas, luego repasos que tocan hoy, luego nuevas' },
  { id: 'falladas', texto: 'Solo falladas', ayuda: 'Repesca de lo que no dominas' },
  { id: 'repaso', texto: 'Repaso', ayuda: 'Acertadas a las que les toca volver' },
  { id: 'nuevas', texto: 'Solo nuevas', ayuda: 'Preguntas que aún no has visto' },
]

const LONGITUDES = [10, 20, 30, 50]

export function Home() {
  const { temas, preguntas, progreso, listo } = useDatos()
  const navegar = useNavigate()
  const [temaId, setTemaId] = useState<string | null>(null)
  const [modo, setModo] = useState<Modo>('mixto')
  const [longitud, setLongitud] = useState(20)

  const seleccionadas = useMemo(
    () => (temaId ? preguntas.filter((p) => p.tema_id === temaId) : preguntas),
    [preguntas, temaId],
  )

  const stats = useMemo(() => resumen(seleccionadas, progreso), [seleccionadas, progreso])
  // Sobre TODAS las preguntas: `stats` mira solo el tema elegido, y el botón
  // de «Todos los temas» debe seguir contando el conjunto entero.
  const globales = useMemo(() => resumen(preguntas, progreso), [preguntas, progreso])

  const disponibles = useMemo(() => {
    const { falladas, nuevas, repasos, descansando } = clasificar(seleccionadas, progreso)
    if (modo === 'falladas') return falladas.length
    if (modo === 'nuevas') return nuevas.length
    // En repaso se adelantan las que aún no tocan si hoy no hay ninguna.
    if (modo === 'repaso') return repasos.length + descansando.length
    return seleccionadas.length
  }, [seleccionadas, progreso, modo])

  if (!listo) return <p className="text-slate-400">Cargando…</p>

  if (!preguntas.length) {
    return (
      <div className="space-y-4">
        <MetaDiaria />
        <div className="rounded-2xl border border-dashed border-[var(--color-borde)] p-6 text-center">
          <h2 className="font-medium">Todavía no hay preguntas</h2>
          <p className="mt-1 text-sm text-slate-400">
            Carga un pack JSON o genera preguntas a partir de un PDF o un texto.
          </p>
          <Link
            to="/importar"
            className="mt-4 inline-block rounded-xl bg-[var(--color-acento)] px-4 py-2 text-sm font-medium text-white"
          >
            Añadir contenido
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <MetaDiaria />

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-300">Tema</h2>
        <div className="grid gap-2">
          <BotonTema
            activo={temaId === null}
            nombre="Todos los temas"
            detalle={`${globales.total} preguntas · ${globales.dominadas} dominadas`}
            recuento={globales}
            onClick={() => setTemaId(null)}
          />
          {temas.map((t) => {
            const delTema = preguntas.filter((p) => p.tema_id === t.id)
            const r = resumen(delTema, progreso)
            return (
              <BotonTema
                key={t.id}
                activo={temaId === t.id}
                nombre={t.nombre}
                detalle={`${r.total} preguntas · ${r.dominadas} dominadas`}
                recuento={r}
                onClick={() => setTemaId(t.id)}
              />
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-300">Modo</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MODOS.map((m) => (
            <button
              key={m.id}
              onClick={() => setModo(m.id)}
              title={m.ayuda}
              className={`rounded-xl border px-3 py-2 text-sm ${
                modo === m.id
                  ? 'border-[var(--color-acento)] bg-[var(--color-acento)]/15 text-white'
                  : 'border-[var(--color-borde)] text-slate-400'
              }`}
            >
              {m.texto}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          {MODOS.find((m) => m.id === modo)!.ayuda} · {disponibles} disponibles
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-300">Preguntas por sesión</h2>
        <div className="grid grid-cols-4 gap-2">
          {LONGITUDES.map((n) => (
            <button
              key={n}
              onClick={() => setLongitud(n)}
              className={`rounded-xl border px-3 py-2 text-sm tabular-nums ${
                longitud === n
                  ? 'border-[var(--color-acento)] bg-[var(--color-acento)]/15 text-white'
                  : 'border-[var(--color-borde)] text-slate-400'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      <button
        disabled={disponibles === 0}
        onClick={() =>
          navegar(
            `/test?modo=${modo}&n=${longitud}${temaId ? `&tema=${encodeURIComponent(temaId)}` : ''}`,
          )
        }
        className="w-full rounded-2xl bg-[var(--color-acento)] py-3.5 font-medium text-white disabled:opacity-40"
      >
        {disponibles === 0 ? 'Nada pendiente en este modo' : 'Empezar test'}
      </button>

      <p className="text-center text-xs text-slate-500">
        <span className="text-[var(--color-fallo)]">{stats.falladas} falladas</span>
        {' · '}
        <span className="text-[var(--color-acento)]">{stats.repasoHoy} tocan hoy</span>
        {' · '}
        {stats.sinVer} sin ver · {stats.dominadas} dominadas
        <br />
        Lo que aciertas vuelve a los {[1, 2, 4, 8, 16].join(', ')} días; si lo fallas, vuelve hoy
        mismo. Se marca como dominada tras {NIVEL_DOMINADA} aciertos espaciados.
      </p>
    </div>
  )
}

type Recuento = { total: number; acertadas: number; falladas: number; sinVer: number }

function BotonTema({
  activo,
  nombre,
  detalle,
  recuento,
  onClick,
}: {
  activo: boolean
  nombre: string
  detalle: string
  recuento?: Recuento
  onClick: () => void
}) {
  const parte = (n: number) => (recuento?.total ? (n / recuento.total) * 100 : 0)
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border px-4 py-3 text-left ${
        activo
          ? 'border-[var(--color-acento)] bg-[var(--color-acento)]/10'
          : 'border-[var(--color-borde)] bg-[var(--color-panel)]'
      }`}
    >
      <div className="text-sm font-medium">{nombre}</div>
      <div className="text-xs text-slate-400">{detalle}</div>
      {recuento && (
        <>
          <div className="mt-2 flex h-1 overflow-hidden rounded-full bg-[var(--color-panel-alto)]">
            <div
              className="h-full bg-[var(--color-acierto)]"
              style={{ width: `${parte(recuento.acertadas)}%` }}
            />
            <div
              className="h-full bg-[var(--color-fallo)]"
              style={{ width: `${parte(recuento.falladas)}%` }}
            />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] tabular-nums">
            <span className="text-[var(--color-acierto)]">{recuento.acertadas} acertadas</span>
            <span className="text-[var(--color-fallo)]">{recuento.falladas} falladas</span>
            <span className="text-slate-500">{recuento.sinVer} sin ver</span>
          </div>
        </>
      )}
    </button>
  )
}
