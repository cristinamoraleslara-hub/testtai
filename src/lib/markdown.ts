/**
 * Distingue un documento que YA contiene preguntas de uno que es temario,
 * y parsea el primero sin llamar a ningún modelo.
 *
 * Sin imports relativos salvo tipos: lo usan el navegador y el script de Node.
 */
import { OPCION_CASILLA, OPCION_TEST, limpiarMarkdown, quitarComentarios } from './extraer.ts'

export type PreguntaCruda = {
  enunciado: string
  opciones: string[]
  correcta: number
  explicacion: string
  fuente: string
}

export type Deteccion = {
  tipo: 'banco' | 'temario'
  /** 0-1. Por debajo de 0.7 conviene que lo confirme una persona. */
  confianza: number
  motivo: string
  bloquesDePreguntas: number
}

const ENCABEZADO = /^\s*(#{1,6})\s+(.+?)\s*#*$/
const META =
  /^\s*(?:>\s*)?\**\s*(respuesta|soluci[oó]n|correcta|clave|r|explicaci[oó]n|justificaci[oó]n|motivo|fuente|referencia|ref|art[íi]culo)\b\s*\**\s*[:.\-–]\s*(.*)$/i
const CITA = /^\s*>\s?(.*)$/

const esOpcion = (l: string) => OPCION_CASILLA.test(l) || OPCION_TEST.test(l)

/** Quita «a)», «- [x]», «**c.**» y deja el texto de la opción. */
function textoOpcion(linea: string): string {
  const casilla = linea.match(OPCION_CASILLA)
  if (casilla) return limpiarMarkdown(casilla[2])
  const sinVineta = linea.replace(/^\s*(?:[-*+]\s+)?/, '')
  // El asterisco de «**b)**» y el de «b) **texto**» se parecen: se quita
  // primero la etiqueta en negrita completa y solo después la etiqueta pelada,
  // para no comerse la marca de apertura del texto.
  const sinEtiqueta = /^\*{2}\s*[a-eA-E]\s*[).\]]\s*\*{2}/.test(sinVineta)
    ? sinVineta.replace(/^\*{2}\s*[a-eA-E]\s*[).\]]\s*\*{2}\s*/, '')
    : sinVineta.replace(/^[a-eA-E]\s*[).\]]\s*/, '')
  return limpiarMarkdown(sinEtiqueta)
}

const LETRAS = 'abcde'

type Bloque = {
  enunciado: string
  /** Número del enunciado, si venía numerado: lo enlaza con el solucionario. */
  numero: number | null
  /** Línea donde empiezan las opciones: sitúa la pregunta en el documento. */
  linea: number
  lineasOpcion: string[]
  meta: { clave: string; valor: string }[]
  citas: string[]
  encabezado: string
}

const CABECERA_SOLUCIONES =
  /^\s*(?:>\s*)?(?:#{1,6}\s*)?\**\s*(soluciones?|solucionario|respuestas|plantilla|clave)\b/i

/** «1-b», «1. b», «1) b», «1 → b», «| 1 | b |»: pareja número-letra. */
const PAREJAS = /(\d{1,3})\s*[.):\-–=|→]{0,2}\s*\|?\s*([a-eA-E])(?![a-zA-Z])/g

/** Un solucionario suelto y dónde empieza, para saber a qué preguntas aplica. */
export type BloqueClave = {
  linea: number
  entradas: Map<number, number>
}

/**
 * Extrae los solucionarios sueltos («Soluciones: 1-b 2-a 3-d»), cada uno con
 * su posición. Se guardan por separado a propósito: un cuaderno con varios
 * temas reinicia la numeración en cada uno, y fundirlos en un único mapa hace
 * que un tema pise las respuestas de otro sin avisar.
 */
export function extraerBloquesClave(lineas: string[]): BloqueClave[] {
  const bloques: BloqueClave[] = []
  let actual: BloqueClave | null = null
  let enSolucionario = false
  let huecoDesdeUltimaClave = 0

  const cerrar = () => {
    if (actual && actual.entradas.size) bloques.push(actual)
    actual = null
  }

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i]

    if (CABECERA_SOLUCIONES.test(linea)) {
      cerrar()
      enSolucionario = true
      huecoDesdeUltimaClave = 0
      // La cabecera puede traer ya las parejas: «Soluciones: 1-b 2-a».
    } else if (enSolucionario && /^\s*(?:#{1,6}\s)/.test(linea)) {
      enSolucionario = false
      cerrar()
    }

    const parejas = [...linea.matchAll(PAREJAS)]
    // Tres o más parejas en una línea son inequívocas aunque no haya cabecera;
    // una sola solo se acepta dentro de un bloque de soluciones.
    const esLineaClave = parejas.length >= 3 || (enSolucionario && parejas.length >= 1)

    if (!esLineaClave) {
      if (linea.trim()) huecoDesdeUltimaClave++
      // Texto de verdad entre medias: el solucionario anterior ha terminado.
      if (huecoDesdeUltimaClave > 3) cerrar()
      continue
    }

    huecoDesdeUltimaClave = 0
    if (!actual) actual = { linea: i, entradas: new Map() }
    for (const [, num, letra] of parejas) {
      const idx = LETRAS.indexOf(letra.toLowerCase())
      if (idx >= 0) actual.entradas.set(Number(num), idx)
    }
  }
  cerrar()

  return bloques
}

/**
 * Un solucionario responde a las preguntas que lo preceden, hasta el
 * solucionario anterior. Si solo hay uno en todo el documento, vale para
 * todas. Cuando no encaja, se devuelve null y la pregunta se descarta con
 * aviso: antes eso que asignarle una respuesta de otro tema.
 */
export function claveParaPregunta(
  bloques: BloqueClave[],
  lineaPregunta: number,
  numero: number | null,
): number | null {
  if (numero === null || !bloques.length) return null

  const siguiente = bloques.find((b) => b.linea > lineaPregunta)
  if (siguiente) {
    const v = siguiente.entradas.get(numero)
    return v ?? null
  }
  // Sin solucionario después: solo se acepta si hay uno único en el documento.
  if (bloques.length === 1) {
    const v = bloques[0].entradas.get(numero)
    return v ?? null
  }
  return null
}

/**
 * Localiza primero las tandas de opciones (lo más reconocible del formato) y
 * a partir de ahí deduce el enunciado anterior y los metadatos posteriores.
 * Así tolera tanto «a) b) c) d)» como listas de tareas de Markdown.
 */
function trocearBloques(texto: string): Bloque[] {
  const lineas = quitarComentarios(texto).replace(/\r\n?/g, '\n').split('\n')
  const bloques: Bloque[] = []
  /** Encabezado vigente por nivel: pila[2] = «## Artículo 21». */
  const pila: string[] = []
  let usadaHasta = -1

  for (let i = 0; i < lineas.length; i++) {
    const enc = lineas[i].match(ENCABEZADO)
    if (enc) {
      const nivel = enc[1].length
      pila[nivel] = limpiarMarkdown(enc[2])
      for (let n = nivel + 1; n < pila.length; n++) pila[n] = ''
    }

    if (!esOpcion(lineas[i])) continue

    // Extiende la tanda de opciones saltando líneas en blanco sueltas.
    const lineasOpcion: string[] = []
    let j = i
    while (j < lineas.length && lineasOpcion.length < 6) {
      if (!lineas[j].trim()) {
        if (j + 1 < lineas.length && esOpcion(lineas[j + 1])) {
          j++
          continue
        }
        break
      }
      if (!esOpcion(lineas[j])) break
      lineasOpcion.push(lineas[j])
      j++
    }
    if (lineasOpcion.length < 3) continue

    // El enunciado es la última línea con contenido antes de las opciones.
    let enunciado = ''
    let numero: number | null = null
    let nivelEnunciado = 7
    for (let k = i - 1; k > usadaHasta; k--) {
      const l = lineas[k]
      if (!l.trim() || esOpcion(l) || META.test(l)) continue
      const limpio = limpiarMarkdown(l)
      const numerado = limpio.match(/^(\d{1,3})\s*[.)–-]\s*(.*)$/)
      numero = numerado ? Number(numerado[1]) : null
      enunciado = numerado ? numerado[2] : limpio
      nivelEnunciado = l.match(ENCABEZADO)?.[1].length ?? 7
      break
    }

    // Si el enunciado es él mismo un encabezado, la fuente es su ancestro:
    // «### ¿Cuál es el plazo?» bajo «## Artículo 21» cita el artículo.
    let encabezado = ''
    for (let n = nivelEnunciado - 1; n >= 1; n--) {
      if (pila[n]) {
        encabezado = pila[n]
        break
      }
    }

    // Metadatos y explicaciones posteriores, hasta la siguiente pregunta.
    const meta: { clave: string; valor: string }[] = []
    const citas: string[] = []
    let k = j
    for (; k < lineas.length; k++) {
      const l = lineas[k]
      if (!l.trim()) continue
      if (esOpcion(l) || ENCABEZADO.test(l)) break
      const m = l.match(META)
      if (m) {
        meta.push({ clave: m[1].toLowerCase(), valor: limpiarMarkdown(m[2]) })
        continue
      }
      const c = l.match(CITA)
      if (c) {
        citas.push(limpiarMarkdown(c[1]))
        continue
      }
      break
    }

    bloques.push({ enunciado, numero, linea: i, lineasOpcion, meta, citas, encabezado })
    usadaHasta = k - 1
    i = k - 1
  }

  return bloques
}

/** ¿Es un banco de preguntas o material del que hay que generarlas? */
export function detectarTipo(texto: string): Deteccion {
  const bloques = trocearBloques(texto)
  const lineasUtiles = quitarComentarios(texto).split('\n').filter((l) => l.trim()).length
  const lineasEnBloques = bloques.reduce(
    (n, b) => n + b.lineasOpcion.length + b.meta.length + 1,
    0,
  )
  const densidad = lineasUtiles ? lineasEnBloques / lineasUtiles : 0

  if (bloques.length === 0) {
    return {
      tipo: 'temario',
      confianza: 0.95,
      motivo: 'No se ha encontrado ninguna pregunta con opciones.',
      bloquesDePreguntas: 0,
    }
  }

  // Un temario con un cuestionario al final tiene baja densidad de preguntas.
  if (densidad >= 0.5) {
    return {
      tipo: 'banco',
      confianza: Math.min(0.98, 0.6 + densidad / 2),
      motivo: `${bloques.length} preguntas con opciones ocupan el ${Math.round(densidad * 100)}% del documento.`,
      bloquesDePreguntas: bloques.length,
    }
  }

  return {
    tipo: 'temario',
    confianza: 0.5 + (0.5 - densidad),
    motivo: `Hay ${bloques.length} pregunta(s), pero solo son el ${Math.round(densidad * 100)}% del texto: parece temario con un cuestionario dentro.`,
    bloquesDePreguntas: bloques.length,
  }
}

export type ResultadoBanco = {
  preguntas: PreguntaCruda[]
  /** Cuántos bloques pregunta-con-opciones se han visto en el documento. */
  detectadas: number
  /** Bloques que no se han podido interpretar, con el motivo. */
  incidencias: string[]
  /** Solucionarios sueltos encontrados y cuántas respuestas trae cada uno. */
  solucionarios: number[]
}

/** Parsea un banco de preguntas ya escrito. No inventa nada. */
export function parsearBanco(texto: string): ResultadoBanco {
  const preguntas: PreguntaCruda[] = []
  const incidencias: string[] = []
  const lineas = quitarComentarios(texto).replace(/\r\n?/g, '\n').split('\n')
  const bloquesClave = extraerBloquesClave(lineas)
  const bloques = trocearBloques(texto)

  for (const b of bloques) {
    const etiqueta = (b.enunciado || b.encabezado || '(sin enunciado)').slice(0, 60)
    const opciones = b.lineasOpcion.map(textoOpcion).filter(Boolean)

    if (!b.enunciado) {
      incidencias.push(`Sin enunciado antes de las opciones: «${opciones[0] ?? '?'}…»`)
      continue
    }
    if (opciones.length !== 4) {
      incidencias.push(`«${etiqueta}…»: ${opciones.length} opciones en vez de 4.`)
      continue
    }

    const correcta = resolverCorrecta(b, opciones, bloquesClave)
    if (correcta < 0) {
      incidencias.push(
        `«${etiqueta}…»: no se sabe cuál es la respuesta correcta. Márcala con «- [x]», con negrita, o añade una línea «Respuesta: b» o un solucionario «1-b 2-a» detrás de estas preguntas.`,
      )
      continue
    }

    const meta = (...claves: string[]) =>
      b.meta.find((m) => claves.includes(m.clave))?.valor ?? ''

    preguntas.push({
      enunciado: b.enunciado,
      opciones,
      correcta,
      explicacion: meta('explicación', 'explicacion', 'justificación', 'justificacion', 'motivo') ||
        b.citas.join(' '),
      fuente: meta('fuente', 'referencia', 'ref', 'artículo', 'articulo') || b.encabezado,
    })
  }

  // Un solucionario con más respuestas que preguntas encontradas delata que
  // alguna se ha quedado por el camino (PDF mal extraído, formato raro…).
  // Es la única pista fiable de que falta algo, así que se avisa.
  for (const clave of bloquesClave) {
    const servidas = bloques.filter(
      (b) => claveParaPregunta(bloquesClave, b.linea, b.numero) !== null && esSuBloque(bloquesClave, b, clave),
    ).length
    if (clave.entradas.size > servidas) {
      incidencias.push(
        `Un solucionario trae ${clave.entradas.size} respuestas pero solo se han localizado ${servidas} preguntas suyas: revisa si el documento perdió alguna al convertirse.`,
      )
    }
  }

  return {
    preguntas,
    detectadas: bloques.length,
    incidencias,
    solucionarios: bloquesClave.map((b) => b.entradas.size),
  }
}

/** ¿Es `clave` el solucionario que le toca a la pregunta `b`? */
function esSuBloque(bloques: BloqueClave[], b: Bloque, clave: BloqueClave): boolean {
  const siguiente = bloques.find((x) => x.linea > b.linea)
  return siguiente ? siguiente === clave : bloques.length === 1 && bloques[0] === clave
}

function resolverCorrecta(b: Bloque, opciones: string[], claves: BloqueClave[]): number {
  // 1. Casilla marcada: - [x]
  const marcada = b.lineasOpcion.findIndex((l) => {
    const m = l.match(OPCION_CASILLA)
    return m ? m[1].toLowerCase() === 'x' : false
  })
  if (marcada >= 0) return marcada

  // 2. Marca inline: ✓, (correcta), o la única opción en negrita.
  const senalada = b.lineasOpcion.findIndex((l) => /[✓✔]|\(\s*correcta\s*\)/i.test(l))
  if (senalada >= 0) return senalada
  const negritas = b.lineasOpcion
    .map((l, i) => (/\*\*[^*]+\*\*/.test(l) ? i : -1))
    .filter((i) => i >= 0)
  if (negritas.length === 1) return negritas[0]

  // 3. Metadato «Respuesta: b» o «Solución: Tres meses».
  const valor = b.meta.find((m) =>
    ['respuesta', 'solución', 'solucion', 'correcta', 'clave', 'r'].includes(m.clave),
  )?.valor

  // 4. Solucionario suelto, el que corresponda a la posición de la pregunta.
  if (!valor) {
    const porClave = claveParaPregunta(claves, b.linea, b.numero)
    return porClave !== null && porClave < opciones.length ? porClave : -1
  }

  const letra = valor.trim().match(/^\**\s*([a-eA-E])\s*[).\]]?\s*\**$/)
  if (letra) return LETRAS.indexOf(letra[1].toLowerCase())

  const normalizar = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const porTexto = opciones.findIndex((o) => normalizar(o) === normalizar(valor))
  if (porTexto >= 0) return porTexto

  const porPrefijo = opciones.findIndex(
    (o) => normalizar(o).startsWith(normalizar(valor)) && valor.length > 8,
  )
  return porPrefijo
}
