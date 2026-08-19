/**
 * Convierte un Markdown, texto o PDF en un pack de preguntas importable.
 *
 *   npm run cargar -- <archivo.md|.txt|.pdf> [--tema "Nombre"] [--modo banco|temario]
 *
 * Detecta solo si el archivo YA contiene preguntas escritas (las importa tal
 * cual, sin llamar a ningún modelo) o si es temario del que hay que generarlas.
 * `--modo` fuerza la rama cuando la detección duda.
 *
 * Escribe data/<slug>.pack.json. Generar requiere ANTHROPIC_API_KEY.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { limpiarCuestionarios, segmentarUnidades } from '../src/lib/extraer.ts'
import { detectarTipo, parsearBanco } from '../src/lib/markdown.ts'
import { idPregunta, slug } from '../src/lib/store.ts'
import type { Pack, Pregunta } from '../src/types.ts'

async function textoDeArchivo(ruta: string): Promise<string> {
  if (extname(ruta).toLowerCase() !== '.pdf') return readFile(ruta, 'utf8')

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const datos = new Uint8Array(await readFile(ruta))
  const doc = await pdfjs.getDocument({ data: datos, useSystemFonts: true }).promise
  const paginas: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const contenido = await (await doc.getPage(n)).getTextContent()
    let linea = ''
    const lineas: string[] = []
    for (const item of contenido.items) {
      if (!('str' in item)) continue
      linea += item.str
      if (item.hasEOL) {
        lineas.push(linea)
        linea = ''
      }
    }
    if (linea) lineas.push(linea)
    paginas.push(lineas.join('\n'))
  }
  return paginas.join('\n\n')
}

function opcion(args: string[], nombre: string): string | undefined {
  const i = args.indexOf(`--${nombre}`)
  return i >= 0 ? args[i + 1] : undefined
}

async function main() {
  const args = process.argv.slice(2)
  // Primer argumento suelto que no sea el valor de una opción.
  let ruta: string | undefined
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      i++
      continue
    }
    ruta = args[i]
    break
  }
  if (!ruta) {
    console.error('Uso: npm run cargar -- <archivo.md|.txt|.pdf> [--tema "Nombre"] [--modo banco|temario]')
    process.exit(1)
  }

  const nombreTema = opcion(args, 'tema') ?? basename(ruta, extname(ruta))
  const temaId = slug(nombreTema)
  const forzado = opcion(args, 'modo')
  if (forzado && forzado !== 'banco' && forzado !== 'temario') {
    console.error(`--modo debe ser "banco" o "temario", no "${forzado}".`)
    process.exit(1)
  }

  console.log(`Leyendo ${ruta}…`)
  const bruto = await textoDeArchivo(ruta)

  const deteccion = detectarTipo(bruto)
  const tipo = (forzado as 'banco' | 'temario' | undefined) ?? deteccion.tipo
  console.log(
    `Detectado: ${deteccion.tipo} (${Math.round(deteccion.confianza * 100)}%) — ${deteccion.motivo}`,
  )
  if (forzado) console.log(`Forzado a: ${tipo}`)
  else if (deteccion.confianza < 0.75) {
    console.log('  Confianza baja. Si se ha equivocado, relanza con --modo banco|temario.')
  }

  let preguntas: Pregunta[]
  let descripcion: string

  if (tipo === 'banco') {
    const { preguntas: crudas, incidencias } = parsearBanco(bruto)
    preguntas = crudas.map((q) => ({
      id: idPregunta(temaId, q.enunciado),
      tema_id: temaId,
      enunciado: q.enunciado,
      opciones: q.opciones as Pregunta['opciones'],
      correcta: q.correcta as Pregunta['correcta'],
      explicacion: q.explicacion,
      fuente: q.fuente,
    }))
    descripcion = `${preguntas.length} preguntas importadas de ${basename(ruta)}`
    console.log(`Importadas ${preguntas.length} preguntas tal cual (sin generar nada).`)
    if (incidencias.length) {
      console.warn(`\n${incidencias.length} bloque(s) no interpretados:`)
      incidencias.forEach((i) => console.warn('  ! ' + i))
    }
  } else {
    const limpio = limpiarCuestionarios(bruto)
    console.log(
      `Regla 1 — cuestionarios previos descartados: ${limpio.bloques.length} bloque(s), ${limpio.lineasEliminadas} línea(s).`,
    )
    const unidades = segmentarUnidades(limpio.texto)
    console.log(`Regla 2 — ${unidades.length} unidad(es) a cubrir.`)
    if (!unidades.length) {
      console.error('No se ha podido segmentar. ¿El PDF es texto o una imagen escaneada?')
      process.exit(1)
    }

    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const { generarPreguntas } = await import('../src/lib/generar.ts')
    const resultado = await generarPreguntas(new Anthropic(), {
      temaId,
      nombreTema,
      unidades,
      onProgreso: (_h, _t, m) => console.log('  ' + m),
    })
    preguntas = resultado.preguntas
    descripcion = `${unidades.length} unidades · generado desde ${basename(ruta)}`
    if (!resultado.cobertura.completa) {
      console.warn(
        `Aviso: sin preguntas para ${resultado.cobertura.faltantes.map((u) => u.titulo).join(', ')}`,
      )
    }
  }

  const pack: Pack = {
    temas: [{ id: temaId, nombre: nombreTema, descripcion, orden: 0 }],
    preguntas,
  }

  await mkdir('data', { recursive: true })
  const salida = join('data', `${temaId}.pack.json`)
  await writeFile(salida, JSON.stringify(pack, null, 2))
  console.log(`\n${preguntas.length} preguntas → ${salida}`)
  console.log('Impórtalo desde la app en Contenido → Elegir archivo.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
