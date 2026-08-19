import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDatos } from '../hooks/useDatos'
import { limpiarCuestionarios, segmentarUnidades, type Unidad } from '../lib/extraer'
import { detectarTipo, parsearBanco, type Deteccion, type PreguntaCruda } from '../lib/markdown'
import { idPregunta, slug } from '../lib/store'
import type { Pack, Pregunta } from '../types'

type Analisis = {
  texto: string
  deteccion: Deteccion
  /** Elección efectiva: arranca en lo detectado, la puedes cambiar. */
  tipo: 'banco' | 'temario'
  // Rama temario
  unidades: Unidad[]
  bloquesDescartados: number
  lineasDescartadas: number
  // Rama banco. Se guardan crudas: el id depende del nombre del tema, que
  // se puede editar después de analizar y hasta el momento de importar.
  crudas: PreguntaCruda[]
  incidencias: string[]
  /** Bloques pregunta-con-opciones vistos, importables o no. */
  detectadas: number
  /** Respuestas de cada solucionario suelto encontrado. */
  solucionarios: number[]
}

const CLAVE_API = 'tai.anthropicKey'

export function Contenido() {
  const { temas, preguntas, importarPack, borrarTema } = useDatos()
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [analisis, setAnalisis] = useState<Analisis | null>(null)
  const [texto, setTexto] = useState('')
  const [nombreTema, setNombreTema] = useState('')
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(CLAVE_API) ?? '')
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const inputArchivo = useRef<HTMLInputElement>(null)

  const fallar = (e: unknown) => {
    setError(e instanceof Error ? e.message : String(e))
    setTrabajando(null)
  }

  function exportar() {
    const pack: Pack = { temas, preguntas }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = `tai-tests-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  /** Construye el análisis para un tipo dado, reutilizable al cambiar de rama. */
  function analizarComo(fuente: string, deteccion: Deteccion, tipo: 'banco' | 'temario'): Analisis {
    if (tipo === 'banco') {
      const r = parsearBanco(fuente)
      return {
        texto: fuente,
        deteccion,
        tipo,
        unidades: [],
        bloquesDescartados: 0,
        lineasDescartadas: 0,
        crudas: r.preguntas,
        incidencias: r.incidencias,
        detectadas: r.detectadas,
        solucionarios: r.solucionarios,
      }
    }
    const limpio = limpiarCuestionarios(fuente)
    return {
      texto: fuente,
      deteccion,
      tipo,
      unidades: segmentarUnidades(limpio.texto),
      bloquesDescartados: limpio.bloques.length,
      lineasDescartadas: limpio.lineasEliminadas,
      crudas: [],
      incidencias: [],
      detectadas: 0,
      solucionarios: [],
    }
  }

  function analizar(fuente: string, nombre: string) {
    setError(null)
    setNombreTema(nombre.trim())
    const deteccion = detectarTipo(fuente)
    const a = analizarComo(fuente, deteccion, deteccion.tipo)
    if (a.tipo === 'temario' && !a.unidades.length) {
      setError('No se ha podido segmentar el documento. Si es un PDF escaneado, no lleva texto.')
      return
    }
    setAnalisis(a)
  }

  function cambiarTipo(tipo: 'banco' | 'temario') {
    if (!analisis) return
    setAnalisis(analizarComo(analisis.texto, analisis.deteccion, tipo))
  }

  /** El tema se resuelve al importar, con el nombre que haya en el campo. */
  function temaDelAnalisis() {
    const nombre = nombreTema.trim() || 'Tema sin nombre'
    return {
      id: slug(nombre),
      nombre,
      descripcion:
        analisis?.tipo === 'banco'
          ? `${analisis.crudas.length} preguntas importadas`
          : `${analisis?.unidades.length ?? 0} unidades`,
      orden: temas.length,
    }
  }

  function limpiarFormulario() {
    setAnalisis(null)
    setTexto('')
    setNombreTema('')
  }

  /** Rama banco: importa lo que ya está escrito, sin llamar a ningún modelo. */
  async function importarBanco() {
    if (!analisis) return
    try {
      const tema = temaDelAnalisis()
      const preguntasFinales: Pregunta[] = analisis.crudas.map((q) => ({
        id: idPregunta(tema.id, q.enunciado),
        tema_id: tema.id,
        enunciado: q.enunciado,
        opciones: q.opciones as Pregunta['opciones'],
        correcta: q.correcta as Pregunta['correcta'],
        explicacion: q.explicacion,
        fuente: q.fuente,
      }))
      const r = await importarPack({ temas: [tema], preguntas: preguntasFinales })
      limpiarFormulario()
      setAviso(
        `${r.preguntas} preguntas importadas tal cual en «${tema.nombre}». Tu progreso se conserva.` +
          (analisis.incidencias.length
            ? ` ${analisis.incidencias.length} bloque(s) quedaron fuera.`
            : ''),
      )
    } catch (e) {
      fallar(e)
    }
  }

  /** Rama temario: genera preguntas nuevas cubriendo todas las unidades. */
  async function generar() {
    if (!analisis) return
    if (!apiKey.trim()) {
      setError('Introduce una clave de la API de Anthropic para generar preguntas.')
      return
    }
    setError(null)
    localStorage.setItem(CLAVE_API, apiKey.trim())
    setTrabajando('Preparando…')
    try {
      // El SDK solo se descarga cuando de verdad se va a generar.
      const [{ default: Anthropic }, { generarPreguntas }] = await Promise.all([
        import('@anthropic-ai/sdk'),
        import('../lib/generar'),
      ])
      const client = new Anthropic({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true })
      const tema = temaDelAnalisis()
      const { preguntas: nuevas, cobertura } = await generarPreguntas(client, {
        temaId: tema.id,
        nombreTema: tema.nombre,
        unidades: analisis.unidades,
        onProgreso: (_h, _t, m) => setTrabajando(m),
      })
      await importarPack({ temas: [tema], preguntas: nuevas })
      setTrabajando(null)
      limpiarFormulario()
      setAviso(
        `${nuevas.length} preguntas generadas.` +
          (cobertura.completa
            ? ' Cobertura completa: todas las unidades tienen preguntas.'
            : ` Sin cubrir: ${cobertura.faltantes.map((u) => u.titulo).join(', ')}.`),
      )
    } catch (e) {
      fallar(e)
    }
  }

  /** Punto de entrada único: el tipo de archivo decide el camino. */
  async function abrirArchivo(f: File) {
    setError(null)
    const nombreBase = f.name.replace(/\.(md|markdown|txt|pdf|json)$/i, '')
    try {
      if (/\.json$/i.test(f.name)) {
        const pack = JSON.parse(await f.text()) as Pack
        if (!Array.isArray(pack.preguntas) || !Array.isArray(pack.temas)) {
          throw new Error('El JSON no tiene la forma { temas: [], preguntas: [] }')
        }
        const r = await importarPack(pack)
        setAviso(
          `Importado: ${r.preguntas} preguntas en ${r.temas} tema(s). Tu progreso se conserva.`,
        )
        return
      }
      if (/\.pdf$/i.test(f.name)) {
        setTrabajando('Leyendo el PDF…')
        const { textoDePdf } = await import('../lib/pdf')
        const t = await textoDePdf(f)
        setTexto(t)
        setTrabajando(null)
        analizar(t, nombreBase)
        return
      }
      const t = await f.text()
      setTexto(t)
      analizar(t, nombreBase)
    } catch (e) {
      fallar(e)
    }
  }

  return (
    <div className="space-y-6">
      {aviso && <Banda tono="ok" texto={aviso} onCerrar={() => setAviso(null)} />}
      {error && <Banda tono="error" texto={error} onCerrar={() => setError(null)} />}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-slate-300">Tus temas</h2>
        {temas.length === 0 && <p className="text-sm text-slate-500">Aún no hay temas.</p>}
        {temas.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-borde)] bg-[var(--color-panel)] p-3"
          >
            <div className="min-w-0">
              <div className="truncate text-sm">{t.nombre}</div>
              <div className="text-xs text-slate-500">
                {preguntas.filter((p) => p.tema_id === t.id).length} preguntas
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Link
                to={`/preguntas?tema=${encodeURIComponent(t.id)}`}
                className="rounded-lg border border-[var(--color-borde)] px-2.5 py-1 text-xs text-slate-400"
              >
                Ver
              </Link>
              <button
                onClick={() => {
                  if (
                    confirm(
                      `¿Borrar el tema "${t.nombre}", sus preguntas y tu progreso en ellas?`,
                    )
                  )
                    borrarTema(t.id)
                }}
                className="rounded-lg border border-[var(--color-borde)] px-2.5 py-1 text-xs text-slate-400"
              >
                Borrar
              </button>
            </div>
          </div>
        ))}
        {preguntas.length > 0 && (
          <button
            onClick={exportar}
            className="w-full rounded-xl border border-[var(--color-borde)] py-2.5 text-sm"
          >
            Exportar copia de seguridad
          </button>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-panel)] p-4">
        <div>
          <h2 className="text-sm font-medium">Añadir contenido</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Markdown, texto, PDF o un pack JSON. La app mira el archivo y decide sola si son
            preguntas que ya tienes escritas —las importa tal cual— o temario del que hay que
            generarlas. Siempre te enseña qué ha decidido antes de tocar nada.
          </p>
        </div>

        <input
          value={nombreTema}
          onChange={(e) => setNombreTema(e.target.value)}
          placeholder="Nombre del tema (p. ej. Ley 39/2015 — Título IV)"
          className="w-full rounded-xl border border-[var(--color-borde)] bg-[var(--color-panel-alto)] px-3 py-2.5 text-sm outline-none focus:border-[var(--color-acento)]"
        />

        <div className="flex gap-2">
          <button
            onClick={() => inputArchivo.current?.click()}
            className="flex-1 rounded-xl border border-[var(--color-borde)] py-2.5 text-sm"
          >
            Elegir archivo
          </button>
          <input
            ref={inputArchivo}
            type="file"
            accept=".md,.markdown,.txt,.pdf,.json,text/markdown,text/plain,application/pdf,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) abrirArchivo(f)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => analizar(texto, nombreTema || 'Tema sin nombre')}
            disabled={texto.trim().length < 200}
            className="flex-1 rounded-xl border border-[var(--color-borde)] py-2.5 text-sm disabled:opacity-40"
          >
            Analizar texto pegado
          </button>
        </div>

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={6}
          placeholder="…o pega aquí el Markdown o el texto"
          className="w-full resize-y rounded-xl border border-[var(--color-borde)] bg-[var(--color-panel-alto)] px-3 py-2.5 font-mono text-xs outline-none focus:border-[var(--color-acento)]"
        />

        {analisis && (
          <PanelAnalisis
            analisis={analisis}
            apiKey={apiKey}
            trabajando={trabajando}
            onCambiarTipo={cambiarTipo}
            onApiKey={setApiKey}
            onImportar={importarBanco}
            onGenerar={generar}
            onCancelar={() => setAnalisis(null)}
          />
        )}

        {trabajando && !analisis && <p className="text-sm text-slate-400">{trabajando}</p>}
      </section>
    </div>
  )
}

function PanelAnalisis({
  analisis,
  apiKey,
  trabajando,
  onCambiarTipo,
  onApiKey,
  onImportar,
  onGenerar,
  onCancelar,
}: {
  analisis: Analisis
  apiKey: string
  trabajando: string | null
  onCambiarTipo: (t: 'banco' | 'temario') => void
  onApiKey: (k: string) => void
  onImportar: () => void
  onGenerar: () => void
  onCancelar: () => void
}) {
  const { deteccion, tipo } = analisis
  const dudoso = deteccion.confianza < 0.75
  const cambiado = tipo !== deteccion.tipo

  return (
    <div
      className={`space-y-3 rounded-xl border p-3 ${
        dudoso && !cambiado
          ? 'border-amber-400/50 bg-amber-400/5'
          : 'border-[var(--color-acento)]/40 bg-[var(--color-acento)]/5'
      }`}
    >
      <div>
        <p className="text-sm font-medium">
          {tipo === 'banco' ? 'Preguntas ya escritas' : 'Temario para generar preguntas'}
          {!cambiado && (
            <span className="ml-2 text-xs font-normal text-slate-400">
              detectado · {Math.round(deteccion.confianza * 100)}% de confianza
            </span>
          )}
          {cambiado && (
            <span className="ml-2 text-xs font-normal text-amber-300">elegido por ti</span>
          )}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">{deteccion.motivo}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onCambiarTipo('banco')}
          className={`rounded-lg border px-3 py-2 text-xs ${
            tipo === 'banco'
              ? 'border-[var(--color-acento)] bg-[var(--color-acento)]/15 text-white'
              : 'border-[var(--color-borde)] text-slate-400'
          }`}
        >
          Importar tal cual
        </button>
        <button
          onClick={() => onCambiarTipo('temario')}
          className={`rounded-lg border px-3 py-2 text-xs ${
            tipo === 'temario'
              ? 'border-[var(--color-acento)] bg-[var(--color-acento)]/15 text-white'
              : 'border-[var(--color-borde)] text-slate-400'
          }`}
        >
          Generar preguntas
        </button>
      </div>

      {tipo === 'banco' ? (
        <>
          <div className="space-y-1 text-sm">
            <p>
              <strong>{analisis.detectadas}</strong> pregunta
              {analisis.detectadas === 1 ? '' : 's'} encontrada
              {analisis.detectadas === 1 ? '' : 's'} en el archivo ·{' '}
              <strong className="text-[var(--color-acierto)]">{analisis.crudas.length}</strong>{' '}
              se importan
              {analisis.detectadas > analisis.crudas.length && (
                <>
                  {' · '}
                  <strong className="text-amber-300">
                    {analisis.detectadas - analisis.crudas.length}
                  </strong>{' '}
                  quedan fuera
                </>
              )}
            </p>
            {analisis.solucionarios.length > 0 && (
              <p className="text-xs text-slate-400">
                {analisis.solucionarios.length} solucionario
                {analisis.solucionarios.length === 1 ? '' : 's'} aparte (
                {analisis.solucionarios.join(' + ')} respuestas). Cada uno se empareja con su
                cuestionario por el título, así que da igual que estén a treinta páginas de
                distancia o que la numeración se reinicie en cada uno.
              </p>
            )}
            <p className="text-xs text-slate-400">
              No se llama a ningún modelo ni hace falta clave: se importan tal cual.
            </p>
          </div>
          {analisis.incidencias.length > 0 && (
            <details className="text-xs text-amber-300">
              <summary className="cursor-pointer">
                {analisis.incidencias.length} bloque(s) que no se han podido leer
              </summary>
              <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-slate-400">
                {analisis.incidencias.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </details>
          )}
          <details className="text-xs text-slate-400">
            <summary className="cursor-pointer">Ver las 3 primeras</summary>
            <ul className="mt-2 space-y-2">
              {analisis.crudas.slice(0, 3).map((p, i) => (
                <li key={i}>
                  <span className="text-slate-300">{p.enunciado}</span>
                  <br />
                  <span className="text-[var(--color-acierto)]">
                    ✓ {p.opciones[p.correcta]}
                  </span>
                </li>
              ))}
            </ul>
          </details>
          <div className="flex gap-2">
            <button
              onClick={onCancelar}
              className="rounded-xl border border-[var(--color-borde)] px-3 py-2.5 text-sm text-slate-400"
            >
              Cancelar
            </button>
            <button
              onClick={onImportar}
              disabled={!analisis.crudas.length}
              className="flex-1 rounded-xl bg-[var(--color-acento)] py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Importar {analisis.crudas.length} preguntas
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm">
            <strong>{analisis.unidades.length}</strong> unidad
            {analisis.unidades.length === 1 ? '' : 'es'} a cubrir ·{' '}
            <strong>{analisis.bloquesDescartados}</strong> cuestionario
            {analisis.bloquesDescartados === 1 ? '' : 's'} previo
            {analisis.bloquesDescartados === 1 ? '' : 's'} descartado
            {analisis.bloquesDescartados === 1 ? '' : 's'} ({analisis.lineasDescartadas} líneas).
          </p>
          <details className="text-xs text-slate-400">
            <summary className="cursor-pointer">Ver unidades a cubrir</summary>
            <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
              {analisis.unidades.map((u) => (
                <li key={u.id}>{u.titulo}</li>
              ))}
            </ul>
          </details>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKey(e.target.value)}
            placeholder="Clave API de Anthropic (sk-ant-…)"
            className="w-full rounded-xl border border-[var(--color-borde)] bg-[var(--color-panel-alto)] px-3 py-2.5 text-sm outline-none focus:border-[var(--color-acento)]"
          />
          <p className="text-[11px] leading-relaxed text-slate-500">
            La clave se guarda solo en este navegador y viaja únicamente a la API de Anthropic. Si
            prefieres no tenerla en el móvil, genera los packs en el ordenador con{' '}
            <code className="text-slate-400">npm run cargar</code> e impórtalos aquí.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onCancelar}
              className="rounded-xl border border-[var(--color-borde)] px-3 py-2.5 text-sm text-slate-400"
            >
              Cancelar
            </button>
            <button
              onClick={onGenerar}
              disabled={!!trabajando}
              className="flex-1 rounded-xl bg-[var(--color-acento)] py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {trabajando ?? 'Generar preguntas'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Banda({
  tono,
  texto,
  onCerrar,
}: {
  tono: 'ok' | 'error'
  texto: string
  onCerrar: () => void
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-sm ${
        tono === 'ok'
          ? 'border-[var(--color-acierto)]/40 bg-[var(--color-acierto)]/10'
          : 'border-[var(--color-fallo)]/40 bg-[var(--color-fallo)]/10'
      }`}
    >
      <span>{texto}</span>
      <button onClick={onCerrar} className="shrink-0 text-slate-400">
        ✕
      </button>
    </div>
  )
}
