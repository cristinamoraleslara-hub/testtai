import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useDatos } from '../hooks/useDatos'
import { NIVEL_DOMINADA } from '../lib/srs'

/** Listado del contenido de un tema, para revisar y borrar preguntas sueltas. */
export function Preguntas() {
  const [params, setParams] = useSearchParams()
  const { temas, preguntas, progreso, borrarPreguntas, reiniciarProgreso, listo } = useDatos()

  const temaId = params.get('tema')
  const [busqueda, setBusqueda] = useState('')
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return preguntas
      .filter((p) => !temaId || p.tema_id === temaId)
      .filter(
        (p) =>
          !q ||
          p.enunciado.toLowerCase().includes(q) ||
          p.fuente.toLowerCase().includes(q) ||
          p.opciones.some((o) => o.toLowerCase().includes(q)),
      )
  }, [preguntas, temaId, busqueda])

  const alternar = (id: string) =>
    setMarcadas((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  async function borrarMarcadas() {
    const n = marcadas.size
    if (!n) return
    if (!confirm(`¿Borrar ${n} pregunta${n === 1 ? '' : 's'}? También se borra su progreso.`)) return
    await borrarPreguntas([...marcadas])
    setMarcadas(new Set())
  }

  if (!listo) return <p className="text-slate-400">Cargando…</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-slate-300">
          {visibles.length} pregunta{visibles.length === 1 ? '' : 's'}
        </h2>
        <Link to="/importar" className="text-xs text-slate-400 underline">
          Volver a Contenido
        </Link>
      </div>

      <select
        value={temaId ?? ''}
        onChange={(e) => setParams(e.target.value ? { tema: e.target.value } : {})}
        className="w-full rounded-xl border border-[var(--color-borde)] bg-[var(--color-panel)] px-3 py-2.5 text-sm"
      >
        <option value="">Todos los temas</option>
        {temas.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nombre}
          </option>
        ))}
      </select>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar en enunciados, opciones o fuente…"
        className="w-full rounded-xl border border-[var(--color-borde)] bg-[var(--color-panel)] px-3 py-2.5 text-sm outline-none focus:border-[var(--color-acento)]"
      />

      {marcadas.size > 0 && (
        <div className="sticky top-28 z-10 flex items-center justify-between gap-3 rounded-xl border border-[var(--color-fallo)]/40 bg-[var(--color-fallo)]/10 p-3 text-sm backdrop-blur">
          <span>
            {marcadas.size} seleccionada{marcadas.size === 1 ? '' : 's'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setMarcadas(new Set())}
              className="rounded-lg border border-[var(--color-borde)] px-3 py-1.5 text-xs text-slate-300"
            >
              Quitar
            </button>
            <button
              onClick={borrarMarcadas}
              className="rounded-lg bg-[var(--color-fallo)] px-3 py-1.5 text-xs font-medium text-white"
            >
              Borrar
            </button>
          </div>
        </div>
      )}

      <ul className="space-y-2">
        {visibles.map((p) => {
          const pr = progreso[p.id]
          const marcada = marcadas.has(p.id)
          return (
            <li
              key={p.id}
              className={`rounded-xl border p-3 ${
                marcada
                  ? 'border-[var(--color-fallo)] bg-[var(--color-fallo)]/10'
                  : 'border-[var(--color-borde)] bg-[var(--color-panel)]'
              }`}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={marcada}
                  onChange={() => alternar(p.id)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-fallo)]"
                />
                <div className="min-w-0 flex-1">
                  {p.fuente && (
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">{p.fuente}</p>
                  )}
                  <p className="text-sm leading-relaxed">{p.enunciado}</p>
                  <p className="mt-1 text-xs text-[var(--color-acierto)]">
                    ✓ {p.opciones[p.correcta]}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {!pr
                      ? 'sin ver'
                      : pr.nivel >= NIVEL_DOMINADA
                        ? `dominada · ${pr.aciertos} aciertos`
                        : `caja ${pr.nivel} · ${pr.aciertos} aciertos, ${pr.fallos} fallos`}
                  </p>
                </div>
              </label>
            </li>
          )
        })}
      </ul>

      {visibles.length === 0 && (
        <p className="text-sm text-slate-500">Nada que mostrar con este filtro.</p>
      )}

      {visibles.length > 0 && (
        <button
          onClick={async () => {
            if (
              confirm(
                'Se pondrán a cero los aciertos y fallos de las preguntas mostradas. Las preguntas se conservan. ¿Seguir?',
              )
            ) {
              await reiniciarProgreso(visibles.map((p) => p.id))
            }
          }}
          className="w-full rounded-xl border border-[var(--color-borde)] py-2.5 text-sm text-slate-400"
        >
          Reiniciar mi progreso en estas preguntas
        </button>
      )}
    </div>
  )
}
