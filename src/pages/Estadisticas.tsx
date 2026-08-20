import { useMemo } from 'react'
import { useDatos } from '../hooks/useDatos'
import { formatoTiempo, META_SEGUNDOS } from '../components/MetaDiaria'
import { NIVEL_DOMINADA, resumen } from '../lib/srs'

const DIAS = 21

function ultimosDias(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (n - 1 - i))
    return d.toISOString().slice(0, 10)
  })
}

export function Estadisticas() {
  const { temas, preguntas, progreso, sesiones, listo } = useDatos()

  const dias = useMemo(() => {
    const mapa = new Map(sesiones.map((s) => [s.fecha, s]))
    return ultimosDias(DIAS).map((fecha) => ({
      fecha,
      segundos: mapa.get(fecha)?.segundos ?? 0,
      respondidas: mapa.get(fecha)?.respondidas ?? 0,
      aciertos: mapa.get(fecha)?.aciertos ?? 0,
    }))
  }, [sesiones])

  const racha = useMemo(() => {
    let n = 0
    for (let i = dias.length - 1; i >= 0; i--) {
      if (dias[i].segundos >= META_SEGUNDOS) n++
      else if (i < dias.length - 1) break
    }
    return n
  }, [dias])

  const global = resumen(preguntas, progreso)
  const respondidas = dias.reduce((n, d) => n + d.respondidas, 0)
  const aciertos = dias.reduce((n, d) => n + d.aciertos, 0)

  const flojas = useMemo(
    () =>
      preguntas
        .map((p) => ({ p, pr: progreso[p.id] }))
        .filter((x) => x.pr && x.pr.fallos > 0 && x.pr.nivel < NIVEL_DOMINADA)
        .sort((a, b) => b.pr!.fallos - a.pr!.fallos)
        .slice(0, 8),
    [preguntas, progreso],
  )

  if (!listo) return <p className="text-slate-400">Cargando…</p>

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        <Tarjeta valor={`${racha}`} etiqueta="días de racha" />
        <Tarjeta
          valor={respondidas ? `${Math.round((aciertos / respondidas) * 100)}%` : '—'}
          etiqueta={`aciertos (${DIAS} días)`}
        />
        <Tarjeta valor={`${global.dominadas}`} etiqueta={`de ${global.total} dominadas`} />
      </div>

      <section className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-panel)] p-4">
        <h2 className="text-sm font-medium text-slate-300">Tiempo diario</h2>
        <div className="mt-4 flex h-28 items-end gap-1">
          {dias.map((d) => {
            const alto = Math.max(3, Math.min(100, (d.segundos / META_SEGUNDOS) * 100))
            return (
              <div
                key={d.fecha}
                title={`${d.fecha}: ${formatoTiempo(d.segundos)}`}
                className="flex-1 rounded-t"
                style={{
                  height: `${alto}%`,
                  background:
                    d.segundos >= META_SEGUNDOS
                      ? 'var(--color-acierto)'
                      : d.segundos > 0
                        ? 'var(--color-acento)'
                        : 'var(--color-panel-alto)',
                }}
              />
            )
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Barra completa = 1 hora. Últimos {DIAS} días.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-slate-300">Por tema</h2>
        {temas.map((t) => {
          const r = resumen(
            preguntas.filter((p) => p.tema_id === t.id),
            progreso,
          )
          const pct = r.total ? (r.dominadas / r.total) * 100 : 0
          return (
            <div
              key={t.id}
              className="rounded-xl border border-[var(--color-borde)] bg-[var(--color-panel)] p-3"
            >
              <div className="flex justify-between text-sm">
                <span>{t.nombre}</span>
                <span className="tabular-nums text-slate-400">
                  {r.dominadas}/{r.total}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-panel-alto)]">
                <div className="h-full bg-[var(--color-acierto)]" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </section>

      {flojas.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-slate-300">Lo que más se te resiste</h2>
          <ul className="space-y-2">
            {flojas.map(({ p, pr }) => (
              <li
                key={p.id}
                className="rounded-xl border border-[var(--color-borde)] bg-[var(--color-panel)] p-3 text-sm"
              >
                {p.fuente && (
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
                    {p.fuente}
                  </p>
                )}
                <p className="leading-relaxed text-slate-200">{p.enunciado}</p>
                <p className="mt-2 flex gap-2 text-[var(--color-acierto)]">
                  <span aria-hidden>✓</span>
                  <span>{p.opciones[p.correcta]}</span>
                </p>
                {p.explicacion && (
                  <p className="mt-2 border-t border-[var(--color-borde)] pt-2 text-xs leading-relaxed text-slate-400">
                    {p.explicacion}
                  </p>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  {pr!.fallos} fallo{pr!.fallos === 1 ? '' : 's'} · {pr!.aciertos} acierto
                  {pr!.aciertos === 1 ? '' : 's'}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Tarjeta({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-panel)] p-3 text-center">
      <div className="text-2xl font-semibold tabular-nums">{valor}</div>
      <div className="mt-0.5 text-[11px] leading-tight text-slate-400">{etiqueta}</div>
    </div>
  )
}
