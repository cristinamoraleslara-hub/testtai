import { useDatos } from '../hooks/useDatos'
import { hoy } from '../lib/srs'

export const META_SEGUNDOS = 3600

export function formatoTiempo(segundos: number) {
  const m = Math.floor(segundos / 60)
  const h = Math.floor(m / 60)
  return h > 0 ? `${h} h ${m % 60} min` : `${m} min`
}

export function MetaDiaria({ compacto = false }: { compacto?: boolean }) {
  const { sesiones } = useDatos()
  const sesion = sesiones.find((s) => s.fecha === hoy())
  const segundos = sesion?.segundos ?? 0
  const pct = Math.min(100, (segundos / META_SEGUNDOS) * 100)
  const cumplida = segundos >= META_SEGUNDOS

  if (compacto) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--color-panel-alto)]">
          <div
            className={`h-full ${cumplida ? 'bg-[var(--color-acierto)]' : 'bg-[var(--color-acento)]'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="tabular-nums">{formatoTiempo(segundos)}</span>
      </div>
    )
  }

  return (
    <section className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-panel)] p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-slate-300">Meta de hoy · 1 hora</h2>
        <span className="text-sm tabular-nums text-slate-400">
          {formatoTiempo(segundos)} / 60 min
        </span>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--color-panel-alto)]">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            cumplida ? 'bg-[var(--color-acierto)]' : 'bg-[var(--color-acento)]'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {cumplida
          ? '¡Meta cumplida! Todo lo que hagas ahora es ventaja.'
          : `Te quedan ${formatoTiempo(META_SEGUNDOS - segundos)}. El cronómetro corre mientras respondes.`}
        {sesion?.respondidas ? ` · ${sesion.respondidas} preguntas, ${sesion.aciertos} aciertos.` : ''}
      </p>
    </section>
  )
}
