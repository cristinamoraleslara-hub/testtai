/**
 * Preparación de un documento antes de generar preguntas.
 *
 * Implementa las dos reglas estrictas del pipeline:
 *   R1. Se eliminan los cuestionarios que ya trae el documento original
 *       (tests, autoevaluaciones y sus solucionarios) para no reciclarlos.
 *   R2. Se trocea el texto en unidades (artículos / epígrafes) y se exige
 *       al menos una pregunta por unidad: cobertura total del documento.
 *
 * Sin imports relativos a propósito: este módulo lo usan el navegador y el
 * script de Node por igual.
 */

export type Unidad = {
  id: string
  titulo: string
  texto: string
}

export type Limpieza = {
  texto: string
  lineasEliminadas: number
  bloques: string[]
}

/**
 * Prefijo tolerante a Markdown: encabezados (`###`), citas (`>`), viñetas
 * (`-`, `*`) y negrita (`**`) antes del texto que de verdad interesa.
 */
const MD = String.raw`\s*(?:>\s*)?(?:#{1,6}\s*)?(?:[-*+]\s+)?\*{0,2}\s*`

const CABECERA_CUESTIONARIO = new RegExp(
  `^${MD}(anexo\\s+)?(cuestionario|test\\s+(de|del)?\\s*(repaso|autoevaluaci|conocimiento)?|autoevaluaci[oó]n|preguntas\\s+(de|para)\\s+(repaso|autoevaluaci[oó]n|examen)|ejercicios\\s+de\\s+autoevaluaci[oó]n|examen(es)?\\s+(tipo\\s+test|de\\s+muestra|resuelto)|simulacro|bater[ií]a\\s+de\\s+preguntas|preguntas\\s+tipo\\s+test)\\b`,
  'i',
)

const CABECERA_SOLUCIONES = new RegExp(
  `^${MD}(soluciones?|solucionario|respuestas\\s+correctas|plantilla\\s+de\\s+respuestas|hoja\\s+de\\s+respuestas|clave\\s+de\\s+correcci[oó]n)\\b`,
  'i',
)

/** Reanuda el texto útil: encabezados estructurales del documento. */
const CABECERA_ESTRUCTURAL = new RegExp(
  `^${MD}(art[íi]culo|art\\.|t[íi]tulo|cap[íi]tulo|secci[oó]n|tema|unidad|disposici[oó]n|anexo\\s+[IVX]|libro)\\b`,
  'i',
)

/** «1. ¿Cuál de las siguientes...?», «### 12) Señale la correcta» */
const ENUNCIADO_TEST = new RegExp(
  `^${MD}\\d{1,3}\\s*[.)–-]\\s+.{10,}?(\\?|se[ñn]ale|indique|cu[áa]l de|marque|elija|complete la frase)`,
  'i',
)

/** «a) ...», «B. ...», «- **c)** ...», «- [x] ...» */
export const OPCION_TEST = new RegExp(`^${MD}(?:\\[[ xX]\\]\\s*\\**\\s*)?[a-eA-E]\\s*[).\\]]\\s*\\**\\s*\\S`)

/** Viñeta con casilla de tarea: «- [x] Tres meses» */
export const OPCION_CASILLA = /^\s*[-*+]\s*\[([ xX])\]\s+(.+?)\s*$/

/** «1-c 2-a 3-d» o «1. c 2. a» en una sola línea: plantilla de respuestas. */
const LINEA_PLANTILLA = /^(\s*\d{1,3}\s*[.):-]?\s*[a-eA-E]\b[\s,;|]*){3,}$/

/**
 * Los comentarios HTML no se ven al leer el Markdown, así que no son ni
 * materia de estudio ni preguntas: fuera antes de analizar nada. Los bloques
 * de código sí se respetan, que en un temario técnico son contenido.
 */
export function quitarComentarios(texto: string): string {
  return texto.replace(/<!--[\s\S]*?-->/g, '')
}

/**
 * R1 — Elimina del texto los cuestionarios y solucionarios preexistentes.
 */
export function limpiarCuestionarios(entrada: string): Limpieza {
  const lineas = quitarComentarios(entrada).replace(/\r\n?/g, '\n').split('\n')
  const conservadas: string[] = []
  const bloques: string[] = []
  let descartando = false
  let bloqueActual: string[] = []
  let eliminadas = 0

  const cerrarBloque = () => {
    if (bloqueActual.length) bloques.push(bloqueActual.join('\n').trim())
    bloqueActual = []
  }

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i]

    if (CABECERA_CUESTIONARIO.test(linea) || CABECERA_SOLUCIONES.test(linea)) {
      descartando = true
    } else if (descartando && CABECERA_ESTRUCTURAL.test(linea)) {
      descartando = false
      cerrarBloque()
    }

    if (descartando) {
      bloqueActual.push(linea)
      if (linea.trim()) eliminadas++
      continue
    }

    // Bloque suelto: enunciado numerado seguido de dos o más opciones.
    if (ENUNCIADO_TEST.test(linea)) {
      let j = i + 1
      const opciones: string[] = []
      while (j < lineas.length && opciones.length < 6) {
        const sig = lineas[j]
        if (!sig.trim()) {
          j++
          continue
        }
        if (!OPCION_TEST.test(sig) && !OPCION_CASILLA.test(sig)) break
        opciones.push(sig)
        j++
      }
      if (opciones.length >= 2) {
        const bloque = lineas.slice(i, j)
        bloques.push(bloque.join('\n').trim())
        eliminadas += bloque.filter((l) => l.trim()).length
        i = j - 1
        continue
      }
    }

    if (LINEA_PLANTILLA.test(linea)) {
      bloques.push(linea.trim())
      eliminadas++
      continue
    }

    conservadas.push(linea)
  }
  cerrarBloque()

  return {
    texto: conservadas.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    lineasEliminadas: eliminadas,
    bloques: bloques.filter(Boolean),
  }
}

const ARTICULO = new RegExp(
  `^${MD}(art[íi]culo|art\\.)\\s*(\\d+\\s*(bis|ter|qu[áa]ter|quinquies|sexies)?)\\s*[.\\-–:]?\\s*(.*)$`,
  'i',
)
const EPIGRAFE = new RegExp(
  `^${MD}((t[íi]tulo|cap[íi]tulo|secci[oó]n|tema|unidad|lecci[oó]n)\\s+[\\wIVXLC]+|(\\d+(\\.\\d+)+)\\s+\\S.*)$`,
  'i',
)

/** Encabezado Markdown ATX: captura el nivel y el texto. */
const ENCABEZADO_MD = /^\s*(#{1,6})\s+(.+?)\s*#*$/

/**
 * R2 — Trocea el documento en unidades. Prioriza artículos; si no,
 * encabezados Markdown; luego epígrafes; y como último recurso agrupa
 * párrafos. Ninguna porción del texto se queda fuera de alguna unidad.
 */
export function segmentarUnidades(texto: string): Unidad[] {
  const lineas = texto.split('\n')

  const porArticulo = trocear(lineas, ARTICULO, (m) => `Artículo ${m[2].replace(/\s+/g, ' ').trim()}`)
  if (porArticulo.length >= 2) return porArticulo

  const porMarkdown = trocearPorEncabezados(lineas)
  if (porMarkdown.length >= 2) return porMarkdown

  const porEpigrafe = trocear(lineas, EPIGRAFE, (m) => m[0].trim())
  if (porEpigrafe.length >= 2) return porEpigrafe

  return trocearPorLongitud(texto)
}

/**
 * Un temario en Markdown suele anidar `#` título, `##` capítulos y `###`
 * epígrafes. Cortar por el nivel más profundo da unidades minúsculas y por
 * el más alto, un par de bloques enormes: se elige el nivel que produce más
 * unidades sin bajar de ~250 caracteres de media.
 */
function trocearPorEncabezados(lineas: string[]): Unidad[] {
  let mejor: Unidad[] = []
  for (let nivel = 1; nivel <= 6; nivel++) {
    const patron = new RegExp(`^\\s*#{${nivel}}\\s+(.+?)\\s*#*$`)
    const unidades = trocear(lineas, patron, (m) => limpiarMarkdown(m[1]))
    if (unidades.length < 2) continue
    const media = unidades.reduce((n, u) => n + u.texto.length, 0) / unidades.length
    if (media >= 250 && unidades.length > mejor.length) mejor = unidades
  }
  if (mejor.length) return mejor

  // Documento con pocas secciones largas: corta por cualquier encabezado.
  return trocear(lineas, ENCABEZADO_MD, (m) => limpiarMarkdown(m[2]))
}

/** Quita el marcado inline para titulares y enunciados legibles. */
export function limpiarMarkdown(s: string): string {
  return s
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/(^|\W)[*_]([^*_]+)[*_](\W|$)/g, '$1$2$3')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function trocear(
  lineas: string[],
  patron: RegExp,
  titular: (m: RegExpMatchArray) => string,
): Unidad[] {
  const unidades: Unidad[] = []
  let actual: Unidad | null = null
  const preambulo: string[] = []

  for (const linea of lineas) {
    const m = linea.match(patron)
    if (m) {
      if (actual) unidades.push(actual)
      actual = { id: '', titulo: titular(m), texto: linea }
    } else if (actual) {
      actual.texto += '\n' + linea
    } else {
      preambulo.push(linea)
    }
  }
  if (actual) unidades.push(actual)

  const introducción = preambulo.join('\n').trim()
  if (introducción.length > 400) {
    unidades.unshift({ id: '', titulo: 'Introducción', texto: introducción })
  }

  return unidades
    .map((u) => ({ ...u, texto: u.texto.trim() }))
    .filter((u) => u.texto.length > 80)
    .map((u, i) => ({ ...u, id: `u${i + 1}` }))
}

function trocearPorLongitud(texto: string): Unidad[] {
  const parrafos = texto.split(/\n{2,}/).filter((p) => p.trim().length > 40)
  const unidades: Unidad[] = []
  let buffer: string[] = []
  let largo = 0

  const volcar = () => {
    if (!buffer.length) return
    unidades.push({
      id: `u${unidades.length + 1}`,
      titulo: `Bloque ${unidades.length + 1}`,
      texto: buffer.join('\n\n'),
    })
    buffer = []
    largo = 0
  }

  for (const p of parrafos) {
    buffer.push(p)
    largo += p.length
    if (largo > 1800) volcar()
  }
  volcar()
  return unidades
}

/** Cuántas preguntas pide cada unidad según su densidad de texto. */
export function cupoPorUnidad(u: Unidad, min = 2, max = 8): number {
  return Math.max(min, Math.min(max, Math.round(u.texto.length / 700)))
}

export type Cobertura = {
  completa: boolean
  faltantes: Unidad[]
  porUnidad: { unidad: Unidad; preguntas: number; cupo: number }[]
}

/** R2 — Verifica que toda unidad tenga al menos una pregunta. */
export function verificarCobertura(
  unidades: Unidad[],
  preguntasPorUnidad: Record<string, number>,
): Cobertura {
  const porUnidad = unidades.map((unidad) => ({
    unidad,
    preguntas: preguntasPorUnidad[unidad.id] ?? 0,
    cupo: cupoPorUnidad(unidad),
  }))
  const faltantes = porUnidad.filter((x) => x.preguntas === 0).map((x) => x.unidad)
  return { completa: faltantes.length === 0, faltantes, porUnidad }
}
