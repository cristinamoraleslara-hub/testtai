import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useDatos } from '../hooks/useDatos'
import { useTiempoEstudio } from '../hooks/useTiempoEstudio'
import { MetaDiaria } from '../components/MetaDiaria'
import { construirSesion, type Modo } from '../lib/srs'
import type { Pregunta } from '../types'

/** Baraja las opciones para no memorizar la posición de la correcta. */
function barajarOpciones(p: Pregunta) {
  const orden = [0, 1, 2, 3]
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[orden[i], orden[j]] = [orden[j], orden[i]]
  }
  return {
    opciones: orden.map((i) => p.opciones[i]),
    correcta: orden.indexOf(p.correcta),
  }
}

export function Test() {
  const [params] = useSearchParams()
  const { preguntas, progreso, responder, listo } = useDatos()

  const modo = (params.get('modo') as Modo) ?? 'mixto'
  const limite = Number(params.get('n') ?? 20)
  const temaId = params.get('tema')

  const [cola, setCola] = useState<Pregunta[] | null>(null)
  const [indice, setIndice] = useState(0)
  const [elegida, setElegida] = useState<number | null>(null)
  const [marcador, setMarcador] = useState({ aciertos: 0, fallos: 0 })
  /** Falladas de esta tanda, para el repaso final. */
  const [falladas, setFalladas] = useState<{ pregunta: Pregunta; respondiste: string }[]>([])

  useTiempoEstudio(cola !== null && indice < (cola?.length ?? 0))

  // El pool se congela al montar: responder no debe reordenar la sesión en curso.
  useEffect(() => {
    if (!listo || cola) return
    const ambito = temaId ? preguntas.filter((p) => p.tema_id === temaId) : preguntas
    setCola(construirSesion(ambito, progreso, modo, limite))
  }, [listo, cola, preguntas, progreso, modo, limite, temaId])

  const actual = cola?.[indice]
  const barajada = useMemo(() => (actual ? barajarOpciones(actual) : null), [actual])

  if (!listo || !cola) return <p className="text-slate-400">Preparando test…</p>

  if (!actual) {
    const total = marcador.aciertos + marcador.fallos
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-panel)] p-6 text-center">
          <h2 className="text-lg font-semibold">Sesión terminada</h2>
          <p className="mt-2 text-3xl font-semibold tabular-nums">
            {marcador.aciertos}
            <span className="text-slate-500">/{total}</span>
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {total
              ? `${Math.round((marcador.aciertos / total) * 100)}% de aciertos. Las falladas volverán a salirte.`
              : 'No había preguntas disponibles con estos filtros.'}
          </p>
          <div className="mt-5 flex gap-2">
            <button
              onClick={() => {
                setCola(null)
                setIndice(0)
                setElegida(null)
                setMarcador({ aciertos: 0, fallos: 0 })
                setFalladas([])
              }}
              className="flex-1 rounded-xl bg-[var(--color-acento)] py-2.5 text-sm font-medium text-white"
            >
              Otra tanda
            </button>
            <Link
              to="/"
              className="flex-1 rounded-xl border border-[var(--color-borde)] py-2.5 text-center text-sm"
            >
              Volver
            </Link>
          </div>
        </div>

        {falladas.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-medium text-slate-300">
              Lo que fallaste ({falladas.length})
            </h3>
            <ul className="space-y-3">
              {falladas.map(({ pregunta, respondiste }, i) => (
                <li
                  key={`${pregunta.id}-${i}`}
                  className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-panel)] p-4"
                >
                  {pregunta.fuente && (
                    <p className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">
                      {pregunta.fuente}
                    </p>
                  )}
                  <p className="text-sm leading-relaxed">{pregunta.enunciado}</p>

                  <div className="mt-3 space-y-1.5 text-sm">
                    <p className="flex gap-2 text-[var(--color-fallo)]">
                      <span aria-hidden>✗</span>
                      <span>
                        <span className="text-slate-500">Tu respuesta: </span>
                        {respondiste}
                      </span>
                    </p>
                    <p className="flex gap-2 text-[var(--color-acierto)]">
                      <span aria-hidden>✓</span>
                      <span>
                        <span className="text-slate-500">Correcta: </span>
                        {pregunta.opciones[pregunta.correcta]}
                      </span>
                    </p>
                  </div>

                  {pregunta.explicacion && (
                    <p className="mt-2.5 border-t border-[var(--color-borde)] pt-2.5 text-sm leading-relaxed text-slate-300">
                      {pregunta.explicacion}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <MetaDiaria />
      </div>
    )
  }

  const respondida = elegida !== null
  const acierto = respondida && elegida === barajada!.correcta

  const elegir = (i: number) => {
    if (respondida) return
    setElegida(i)
    const bien = i === barajada!.correcta
    setMarcador((m) => ({
      aciertos: m.aciertos + (bien ? 1 : 0),
      fallos: m.fallos + (bien ? 0 : 1),
    }))
    if (!bien) {
      setFalladas((f) => [...f, { pregunta: actual, respondiste: barajada!.opciones[i] }])
    }
    responder(actual.id, bien)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="tabular-nums">
          {indice + 1} / {cola.length}
        </span>
        <span className="tabular-nums">
          <span className="text-[var(--color-acierto)]">{marcador.aciertos}</span>
          {' · '}
          <span className="text-[var(--color-fallo)]">{marcador.fallos}</span>
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-[var(--color-panel-alto)]">
        <div
          className="h-full bg-[var(--color-acento)] transition-[width]"
          style={{ width: `${(indice / cola.length) * 100}%` }}
        />
      </div>

      <div className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-panel)] p-4">
        {actual.fuente && (
          <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">{actual.fuente}</p>
        )}
        <p className="text-[15px] leading-relaxed">{actual.enunciado}</p>
      </div>

      <div className="grid gap-2">
        {barajada!.opciones.map((texto, i) => {
          const esCorrecta = i === barajada!.correcta
          const esElegida = i === elegida
          let estilo = 'border-[var(--color-borde)] bg-[var(--color-panel)]'
          if (respondida && esCorrecta)
            estilo = 'border-[var(--color-acierto)] bg-[var(--color-acierto)]/15'
          else if (respondida && esElegida)
            estilo = 'border-[var(--color-fallo)] bg-[var(--color-fallo)]/15'
          else if (respondida) estilo = 'border-[var(--color-borde)] opacity-50'

          return (
            <button
              key={i}
              onClick={() => elegir(i)}
              disabled={respondida}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm leading-relaxed ${estilo}`}
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--color-panel-alto)] text-[11px] font-medium">
                {'ABCD'[i]}
              </span>
              <span>{texto}</span>
            </button>
          )
        })}
      </div>

      {respondida && (
        <div
          className={`rounded-2xl border p-4 ${
            acierto
              ? 'border-[var(--color-acierto)]/40 bg-[var(--color-acierto)]/10'
              : 'border-[var(--color-fallo)]/40 bg-[var(--color-fallo)]/10'
          }`}
        >
          <p className="text-sm font-medium">
            {acierto ? 'Correcto' : `Incorrecto — la buena era la ${'ABCD'[barajada!.correcta]}`}
          </p>
          {!acierto && (
            <p className="mt-1 text-sm text-slate-200">{barajada!.opciones[barajada!.correcta]}</p>
          )}
          {actual.explicacion && (
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{actual.explicacion}</p>
          )}
        </div>
      )}

      {/* Barra opaca: los enunciados largos pasaban por detrás del botón. */}
      <div className="sticky bottom-0 -mx-4 border-t border-[var(--color-borde)] bg-[var(--color-lienzo)]/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <button
          disabled={!respondida}
          onClick={() => {
            setIndice((i) => i + 1)
            setElegida(null)
          }}
          className="w-full rounded-2xl bg-[var(--color-acento)] py-3.5 font-medium text-white disabled:opacity-30"
        >
          {indice + 1 === cola.length ? 'Ver resultado' : 'Siguiente'}
        </button>
      </div>
    </div>
  )
}
