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

/** Línea de índice: «1.- CUESTIONARIO 2008 ..................... 5». */
const LINEA_INDICE = /\.{4,}\s*\d*\s*$/

/** Empieza un ítem numerado: «4. De acuerdo con…». Corta continuaciones. */
const ITEM_NUMERADO = /^\s*(?:[-*+]\s+)?\**\s*(?:pregunta|cuesti[oó]n)?\s*\d{1,3}\s*[.):]\s+\S/i

/** Enunciado con etiqueta: «Pregunta 12: ¿…?», «Cuestión 3. …». */
const ENUNCIADO_ETIQUETADO = /^(?:pregunta|cuesti[oó]n)\s*n?[.º°]?\s*(\d{1,3})\s*[:.)–-]\s*(.*)$/i

/**
 * Reduce las muchas formas de rotular un metadato a tres claves. Sin esto hay
 * que ir ampliando listas por todo el archivo cada vez que aparece una
 * variante nueva («Respuesta correcta», «Solución», «Opción correcta»…), y una
 * que se olvide hace que la pregunta se descarte sin motivo aparente.
 */
function claveMeta(rotulo: string): 'respuesta' | 'explicacion' | 'fuente' | '' {
  const t = rotulo.toLowerCase()
  if (/respuesta|soluci|correcta|clave|^r$/.test(t)) return 'respuesta'
  if (/explicaci|justificaci|motivo/.test(t)) return 'explicacion'
  if (/fuente|referencia|^ref$|art[íi]culo/.test(t)) return 'fuente'
  return ''
}

/**
 * Un cuaderno de oposición se organiza en secciones tituladas
 * («1.- CUESTIONARIO 2008 GSI», «9.- RESPUESTAS CUESTIONARIO 2008 GSI»)
 * aunque el Markdown venga de un PDF y no traiga ni un solo `#`.
 * Reconocerlas es lo que permite luego casar cada tanda de preguntas con su
 * solucionario, aunque estén a treinta páginas de distancia.
 */
// Con \b: si no, «a) Red TESTA.» cuela como título porque contiene «test».
const PALABRA_SECCION = /\b(cuestionarios?|respuestas|soluciones?|solucionario|test|examen)\b/i

export function esTituloSeccion(linea: string): boolean {
  const t = linea.trim()
  if (!t || t.length > 90) return false
  if (LINEA_INDICE.test(t)) return false
  if (ENCABEZADO.test(t)) return true
  if (/[?]\s*$/.test(t)) return false
  if (esOpcion(t)) return false // una opción nunca es un título de sección
  // Una frase con punto final es una instrucción, no un título: «NO SEPARE EL
  // EJEMPLAR PARA EL INTERESADO DE LA HOJA DE EXAMEN.» lleva la palabra
  // «examen» pero no encabeza nada.
  if (/\.\s*$/.test(t) && t.split(/\s+/).length > 6) return false
  const sinNumero = t.replace(/^\d+\s*[.\-)]{1,2}\s*/, '')
  if (!PALABRA_SECCION.test(sinNumero)) return false
  // Los títulos de estos cuadernos van en mayúsculas; así no se confunde
  // «1. Señale la respuesta correcta:» con un título de sección.
  const letras = sinNumero.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '')
  if (letras.length < 3) return false
  const mayusculas = sinNumero.replace(/[^A-ZÁÉÍÓÚÑ]/g, '').length
  return mayusculas / letras.length > 0.6
}

/**
 * Reduce un título a lo que lo distingue de los demás, quitando la numeración
 * y las palabras genéricas: «1.- CUESTIONARIO 2008 GSI» y «9.- RESPUESTAS
 * CUESTIONARIO 2008 GSI» dan los dos «2008 gsi», y por ahí se emparejan.
 */
export function discriminador(titulo: string): string {
  return titulo
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\d+\s*[.\-)]{1,2}\s*/, '')
    .replace(
      /\b(respuestas?|soluciones?|solucionario|cuestionarios?|test|examen|de|del|la|el|los|las|y)\b/gi,
      ' ',
    )
    .replace(/[^\wÁÉÍÓÚÑáéíóúñ]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * Metadato tras las opciones: «Respuesta: b», «Explicación: …».
 *
 * Acepta que venga como elemento de lista y con la etiqueta en negrita
 * («- **Respuesta correcta:** B»), que es como lo escriben los tests
 * redactados en Markdown. Las variantes de dos palabras van primero en la
 * alternancia: si «respuesta» ganase, el «correcta» siguiente ya no encajaría
 * con los dos puntos y la línea entera se descartaría.
 */
const META =
  /^\s*(?:>\s*)?(?:[-*+]\s+)?\**\s*(respuestas?\s+correctas?|soluci[oó]n\s+correcta|opci[oó]n\s+correcta|respuesta|soluci[oó]n|correcta|clave|r|explicaci[oó]n|justificaci[oó]n|motivo|fuente|referencia|ref|art[íi]culo)\b\s*\**\s*[:.\-–]\s*\**\s*(.*?)\s*\**\s*$/i
const CITA = /^\s*>\s?(.*)$/

const esOpcion = (l: string) => OPCION_CASILLA.test(l) || OPCION_TEST.test(l)

/** Marcador de opción dentro de una línea: « a) », « b. »… */
const MARCADOR_OPCION = /(?:^|\s)([a-eA-E])\s*[).\]]\s+(?=\S)/g

/**
 * Los exámenes maquetados a dos columnas meten dos opciones en la misma línea:
 * «a) EBOCA b) BECADAS». Sin separarlas, la pregunta se queda en dos opciones
 * y se descarta entera. Solo se parte si los marcadores van en letras
 * consecutivas, para no romper una opción que mencione «... b) ...» por dentro.
 */
export function dividirOpciones(linea: string): string[] {
  const marcas = [...linea.matchAll(MARCADOR_OPCION)]
  if (marcas.length < 2) return [linea]
  const letras = marcas.map((m) => m[1].toLowerCase().charCodeAt(0))
  if (!letras.every((c, k) => k === 0 || c === letras[k - 1] + 1)) return [linea]
  return marcas.map((m, k) => {
    const desde = m.index ?? 0
    const hasta = k + 1 < marcas.length ? (marcas[k + 1].index ?? linea.length) : linea.length
    return linea.slice(desde, hasta).trim()
  })
}

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
  /** Discriminador del título de sección donde vive la pregunta. */
  seccion: string
  /** Título de sección tal cual, para citarlo como fuente. */
  tituloSeccion: string
  /** Cuántas plantillas de respuestas se han visto antes que ella. */
  examen: number
  /** Tramo dentro del examen; se calcula tras trocear, por los reinicios. */
  orden: number
}

const CABECERA_SOLUCIONES =
  /^\s*(?:>\s*)?(?:#{1,6}\s*)?\**\s*(soluciones?|solucionario|respuestas|plantilla|clave)\b/i

/**
 * Igual que la anterior pero para líneas sueltas de texto corrido, donde hay
 * que hilar fino: en las instrucciones de un examen se lee «las respuestas en
 * blanco no penalizan», y eso no abre ningún solucionario.
 */
const CABECERA_SOLUCIONES_ESTRICTA =
  /^\s*(?:>\s*)?(?:#{1,6}\s*)?\**\s*(soluciones?|solucionario|respuestas\s+correctas|plantilla(\s+de\s+respuestas)?|hoja\s+de\s+respuestas|clave(\s+de\s+correcci[oó]n)?)\b\s*\**\s*[:.\-–]?\s*$/i

/**
 * ¿Esta línea abre una plantilla de respuestas? Preguntas y solucionarios se
 * cuentan por el mismo criterio a propósito: si cada lado contase los exámenes
 * a su manera, se desincronizarían y las respuestas irían a otro examen.
 */
export function abreSolucionario(linea: string): boolean {
  return esTituloSeccion(linea)
    ? CABECERA_SOLUCIONES.test(linea.trim().replace(/^\d+\s*[.\-)]{1,2}\s*/, ''))
    : CABECERA_SOLUCIONES_ESTRICTA.test(linea)
}

/** «1-b», «1. b», «1) b», «1 → b», «| 1 | b |»: pareja número-letra. */
const PAREJAS = /(\d{1,3})\s*[.):\-–=|→]{0,2}\s*\|?\s*([a-eA-E])(?![a-zA-Z])/g

/**
 * Una línea de solucionario no contiene nada más que parejas (y, como mucho,
 * un «ANULADA» o los palotes de una tabla). Exigirlo es lo que impide que un
 * enunciado como «los Artículos 15 a 29 de la Constitución» se cuele como si
 * dijera que la respuesta 15 es la a).
 */
const SOLO_PAREJAS =
  /^[\s|]*(?:\d{1,3}\s*[.):\-–=|→]{0,2}\s*(?:[a-eA-E]\b|ANULADA|X)[\s,;|-]*)+$/i

/** Encabezado o pie de página repetido en cada hoja de un PDF. */
const LINEA_PAGINA = /P[áa]gina\s+\d+\s+de\s+\d+/i

/**
 * Esa misma cabecera suele identificar el examen mejor que ningún título:
 * «2024 - TAI-L – MODELO A Página 1 de 14». Se aprovecha como fuente, que es
 * más útil al estudiar que el rótulo de la plantilla de respuestas.
 */
function etiquetaDePagina(linea: string): string {
  const antes = linea.split(/P[áa]gina\s+\d+\s+de\s+\d+/i)[0].trim()
  return antes.length >= 4 && antes.length <= 60 ? antes : ''
}

/**
 * Un tramo de solucionario con numeración continua. Una misma plantilla puede
 * traer varios: «Primera parte 1-80», «Preguntas de reserva 1-5», «Supuesto I
 * 1-20»… Cada reinicio de la numeración abre un tramo nuevo.
 */
export type BloqueClave = {
  linea: number
  /** Discriminador del título de su sección, para casarlo con las preguntas. */
  seccion: string
  /** Cuántas plantillas se han abierto antes que esta (1, 2, 3…). */
  examen: number
  /** Posición del tramo dentro de su plantilla (0, 1, 2…). */
  orden: number
  entradas: Map<number, number>
}

/**
 * Extrae los solucionarios sueltos («Soluciones: 1-b 2-a 3-d», o una tabla
 * «| 1. B | 2. A |»), agrupados por la sección que los titula.
 *
 * Agrupar por sección y no por proximidad es lo que aguanta un cuaderno real:
 * entre las filas de una tabla hay líneas separadoras, subtítulos como
 * «BLOQUE I Y II» y huecos, y agrupar por contigüidad los partía en trozos.
 */
export function extraerBloquesClave(lineas: string[]): BloqueClave[] {
  const bloques: BloqueClave[] = []
  let seccion = ''
  let enSolucionario = false
  let examen = 0
  let orden = 0
  let ultimoNumero = 0

  /** Tramos del examen en curso, por columna. */
  let columnas: BloqueClave[] = []

  const tramo = (col: number, i: number): BloqueClave => {
    if (!columnas[col]) {
      columnas[col] = { linea: i, seccion, examen, orden: col, entradas: new Map() }
      bloques.push(columnas[col])
    }
    return columnas[col]
  }

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i]

    if (abreSolucionario(linea)) {
      // Cada plantilla nueva abre un examen: sus preguntas vendrán detrás.
      examen++
      orden = 0
      ultimoNumero = 0 // si no, el «1» de la plantilla nueva parece un reinicio
      columnas = []
      enSolucionario = true
    } else if (esTituloSeccion(linea) || esOpcion(linea)) {
      // Donde empiezan las opciones se acabó la plantilla: sin este corte, un
      // enunciado como «los Artículos 15 a 29» se leería como «15 → a».
      enSolucionario = false
    }

    if (esTituloSeccion(linea)) {
      const d = discriminador(linea.trim())
      if (d) seccion = d
    }

    if (LINEA_INDICE.test(linea) || LINEA_PAGINA.test(linea)) continue

    const parejas = [...linea.matchAll(PAREJAS)]
    if (!parejas.length) continue
    // Tres o más parejas en una línea son inequívocas aunque no haya cabecera;
    // dentro de una plantilla basta una, pero la línea no puede traer nada más.
    if (!SOLO_PAREJAS.test(linea)) continue
    if (!enSolucionario && parejas.length < 3) continue

    const numeros = parejas.map((p) => Number(p[1]))
    // Una plantilla a varias columnas pone en la misma fila la respuesta de
    // cada bloque: «1. C  1. A  1. A  1. A». Se reconoce porque los números no
    // avanzan dentro de la línea, y entonces cada posición es una columna.
    const enColumnas = numeros.length > 1 && !numeros.every((n, k) => k === 0 || n > numeros[k - 1])

    parejas.forEach((p, col) => {
      const idx = LETRAS.indexOf(p[2].toLowerCase())
      if (idx < 0) return
      const n = Number(p[1])
      if (enColumnas) {
        tramo(col, i).entradas.set(n, idx)
        ultimoNumero = 0
        return
      }
      // Numeración corrida: cada reinicio abre el tramo siguiente. Una misma
      // plantilla encadena «Primera parte 1-80», «reserva 1-5», «Supuesto I»…
      if (n <= ultimoNumero) orden++
      const destino = tramo(orden, i)
      if (!destino.entradas.has(n)) destino.entradas.set(n, idx)
      ultimoNumero = n
    })
  }

  return bloques.filter((b) => b.entradas.size > 0)
}

/**
 * Numera los tramos de preguntas igual que se numeran los del solucionario:
 * cada vez que la numeración se reinicia empieza un tramo nuevo dentro del
 * mismo examen. Así el tramo 2 de las preguntas casa con el tramo 2 de su
 * plantilla, sin depender de que los rótulos se llamen igual.
 */
function numerarTramos(bloques: Bloque[]): void {
  let examenActual = -1
  let orden = 0
  let ultimo = 0
  for (const b of bloques) {
    if (b.examen !== examenActual) {
      examenActual = b.examen
      orden = 0
      ultimo = 0
    } else if (b.numero !== null && b.numero <= ultimo) {
      orden++
    }
    b.orden = orden
    if (b.numero !== null) ultimo = b.numero
  }
}

/**
 * ¿Hablan del mismo bloque «CUESTIONARIO 2008 GSI» y «RESPUESTAS CUESTIONARIO
 * 2008 GSI»? Tras quitar las palabras genéricas quedan «2008 gsi» y «2008 gsi».
 * Pero también hay que casar «Tema 1. Plazos» con «Soluciones tema 1», donde
 * uno es más escueto que el otro: basta con que las palabras de uno estén
 * contenidas en las del otro.
 */
export function titulosCasan(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  const pa = new Set(a.split(' ').filter(Boolean))
  const pb = new Set(b.split(' ').filter(Boolean))
  if (!pa.size || !pb.size) return false
  const [chico, grande] = pa.size <= pb.size ? [pa, pb] : [pb, pa]
  return [...chico].every((p) => grande.has(p))
}

/**
 * Decide qué solucionario responde a una pregunta. Por orden:
 *
 *   1. El que comparte título con ella («CUESTIONARIO 2008» ↔ «RESPUESTAS
 *      CUESTIONARIO 2008»). Es lo único que funciona cuando un cuaderno pone
 *      ocho cuestionarios seguidos y luego las ocho tandas de respuestas.
 *   2. Si no hay títulos que casen, el primero que venga después de ella.
 *   3. Si solo hay un solucionario en todo el documento, ese.
 *
 * Si nada encaja devuelve null y la pregunta se descarta con aviso: antes eso
 * que colocarle la respuesta de otro cuestionario.
 */
export function claveParaPregunta(
  bloques: BloqueClave[],
  lineaPregunta: number,
  numero: number | null,
  seccionPregunta = '',
  examen = 0,
  orden = 0,
): number | null {
  if (numero === null || !bloques.length) return null

  // 1. Título propio. Es lo más específico cuando existe: distingue
  //    «Soluciones tema 1» de «Soluciones tema 2» aunque estén intercaladas.
  const porTitulo = seccionPregunta
    ? bloques.filter((b) => titulosCasan(b.seccion, seccionPregunta))
    : []
  if (porTitulo.length === 1) return porTitulo[0].entradas.get(numero) ?? null

  // 2. Examen y tramo. Entra cuando los títulos no desempatan, que es el caso
  //    de los exámenes oficiales: todas las plantillas se llaman igual, van
  //    DELANTE de sus preguntas y encadenan varios tramos («Primera parte»,
  //    «reserva», «Supuesto I»…) con la numeración reiniciándose en cada uno.
  if (examen > 0) {
    const delTramo = bloques.filter((b) => b.examen === examen && b.orden === orden)
    if (delTramo.length === 1) return delTramo[0].entradas.get(numero) ?? null
    if (delTramo.length > 1) return null
    // Hay plantillas de este examen pero ninguna encaja con el tramo: no se
    // rebusca en otras, que serían de otra parte del examen.
    if (bloques.some((b) => b.examen === examen)) return null
  }

  if (porTitulo.length > 1) return null // ambiguo: mejor no adivinar

  // Sin títulos utilizables, vale la posición… salvo que haya varias tandas de
  // preguntas y todas las respuestas al final, donde la posición engaña.
  const hayTitulos = bloques.some((b) => b.seccion)
  if (hayTitulos && seccionPregunta) return null

  const siguiente = bloques.find((b) => b.linea > lineaPregunta)
  if (siguiente) return siguiente.entradas.get(numero) ?? null
  if (bloques.length === 1) return bloques[0].entradas.get(numero) ?? null
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

  let seccion = ''
  let tituloSeccion = ''
  let etiquetaExamen = ''
  let examen = 0

  for (let i = 0; i < lineas.length; i++) {
    const enc = lineas[i].match(ENCABEZADO)
    if (enc) {
      const nivel = enc[1].length
      pila[nivel] = limpiarMarkdown(enc[2])
      for (let n = nivel + 1; n < pila.length; n++) pila[n] = ''
    }
    if (abreSolucionario(lineas[i])) {
      examen++
      etiquetaExamen = '' // cada examen trae la suya, si es que la trae
    }
    if (LINEA_PAGINA.test(lineas[i])) {
      const e = etiquetaDePagina(lineas[i])
      if (e) etiquetaExamen = e
      continue
    }
    if (esTituloSeccion(lineas[i])) {
      const d = discriminador(lineas[i])
      if (d) {
        seccion = d
        // El rótulo de una plantilla no describe las preguntas: no es fuente.
        tituloSeccion = abreSolucionario(lineas[i])
          ? ''
          : limpiarMarkdown(lineas[i]).replace(/^\d+\s*[.\-)]{1,2}\s*/, '')
      }
    }
    if (LINEA_INDICE.test(lineas[i])) continue

    if (!esOpcion(lineas[i])) continue

    // Extiende la tanda de opciones. Un PDF convertido a Markdown parte las
    // opciones largas en varias líneas, así que una línea suelta detrás de una
    // opción se trata como continuación suya y no como final de la tanda.
    const lineasOpcion: string[] = []
    let j = i
    while (j < lineas.length && lineasOpcion.length < 6) {
      const l = lineas[j]
      if (!l.trim()) {
        // Un salto de página del PDF deja una línea en blanco en mitad de una
        // frase. Se mira qué viene después de los blancos: si es otra opción, o
        // el resto de la que estábamos leyendo, la tanda sigue.
        let k = j
        while (k < lineas.length && !lineas[k].trim()) k++
        if (k >= lineas.length) break
        const sig = lineas[k]
        const continuaFrase =
          lineasOpcion.length > 0 &&
          lineasOpcion.length < 4 &&
          !ITEM_NUMERADO.test(sig) &&
          !esTituloSeccion(sig) &&
          !META.test(sig)
        if (esOpcion(sig) || continuaFrase) {
          j = k
          continue
        }
        break
      }
      if (esOpcion(l)) {
        for (const parte of dividirOpciones(l)) lineasOpcion.push(parte)
        j++
        continue
      }
      // ¿Continuación de la opción anterior, o ya es otra cosa?
      const cortaLaTanda =
        !lineasOpcion.length || ITEM_NUMERADO.test(l) || esTituloSeccion(l) || META.test(l)
      if (cortaLaTanda) break
      lineasOpcion[lineasOpcion.length - 1] += ' ' + l.trim()
      j++
    }
    if (lineasOpcion.length < 3) continue

    // El enunciado también viene partido: se recoge hacia atrás hasta dar con
    // la línea numerada que lo abre, y se recompone en orden. Los enunciados
    // largos de normativa europea llegan a ocupar diez líneas con un salto de
    // página en medio, así que el tope va por longitud, no por número de
    // líneas; quien corta de verdad es la opción anterior o el título.
    const partes: string[] = []
    let numero: number | null = null
    let nivelEnunciado = 7
    let largo = 0
    for (let k = i - 1; k > usadaHasta && largo < 1500; k--) {
      const l = lineas[k]
      if (!l.trim() || META.test(l)) continue
      largo += l.length
      if (esOpcion(l) || LINEA_INDICE.test(l)) break
      // Un encabezado Markdown sí puede ser el enunciado («### ¿Cuál es…?»);
      // un título suelto en mayúsculas («1.- CUESTIONARIO 2008») nunca lo es.
      if (esTituloSeccion(l) && !ENCABEZADO.test(l)) break
      // La viñeta de lista no es parte del enunciado.
      const limpio = limpiarMarkdown(l).replace(/^[-*+]\s+/, '')
      const numerado = limpio.match(ENUNCIADO_ETIQUETADO) ?? limpio.match(/^(\d{1,3})\s*[.)–-]\s+(.*)$/)
      if (numerado) {
        numero = Number(numerado[1])
        partes.unshift(numerado[2])
        nivelEnunciado = l.match(ENCABEZADO)?.[1].length ?? 7
        break
      }
      partes.unshift(limpio)
      nivelEnunciado = l.match(ENCABEZADO)?.[1].length ?? 7
      if (ENCABEZADO.test(l)) break
    }
    const enunciado = partes.join(' ').replace(/\s+/g, ' ').trim()

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
        const clave = claveMeta(m[1])
        if (clave) meta.push({ clave, valor: limpiarMarkdown(m[2]) })
        continue
      }
      const c = l.match(CITA)
      if (c) {
        citas.push(limpiarMarkdown(c[1]))
        continue
      }
      break
    }

    bloques.push({ enunciado, numero, linea: i, lineasOpcion, meta,
      citas,
      encabezado,
      seccion,
      // La cabecera de página («2024 - TAI-L – MODELO A») identifica el examen
      // mejor que cualquier rótulo suelto en mayúsculas del cuerpo del PDF.
      tituloSeccion: etiquetaExamen || tituloSeccion || (examen > 0 ? `Examen ${examen}` : ''),
      examen,
      orden: 0,
    })
    usadaHasta = k - 1
    i = k - 1
  }

  return bloques
}

/** ¿Es un banco de preguntas o material del que hay que generarlas? */
export function detectarTipo(texto: string): Deteccion {
  const bloques = trocearBloques(texto)
  numerarTramos(bloques)
  // Las líneas de solucionario («1. b», una por respuesta) son parte del
  // aparato de preguntas, no relleno: en un examen oficial con la plantilla
  // delante hay cientos, y contarlas como texto ajeno hundía la densidad hasta
  // hacer pasar por temario un documento que solo tiene preguntas.
  const utiles = quitarComentarios(texto)
    .split('\n')
    .filter((l) => l.trim())
  const lineasDeClave = utiles.filter((l) => SOLO_PAREJAS.test(l)).length
  const lineasUtiles = utiles.length
  const lineasEnBloques =
    bloques.reduce((n, b) => n + b.lineasOpcion.length + b.meta.length + 1, 0) + lineasDeClave
  const densidad = lineasUtiles ? Math.min(1, lineasEnBloques / lineasUtiles) : 0

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
  numerarTramos(bloques)

  for (const b of bloques) {
    // Ubicar la pregunta (cuestionario y número) hace el aviso accionable:
    // sin eso hay que buscar el enunciado a mano en un documento de 36 páginas.
    const donde = [b.tituloSeccion, b.numero !== null ? `pregunta ${b.numero}` : '']
      .filter(Boolean)
      .join(', ')
    const etiqueta =
      (donde ? `${donde} — ` : '') +
      `«${(b.enunciado || b.encabezado || '(sin enunciado)').slice(0, 50)}…»`
    const opciones = b.lineasOpcion.map(textoOpcion).filter(Boolean)

    if (!b.enunciado) {
      incidencias.push(`Sin enunciado antes de las opciones: «${opciones[0] ?? '?'}…»`)
      continue
    }
    if (opciones.length !== 4) {
      incidencias.push(`${etiqueta}: ${opciones.length} opciones en vez de 4.`)
      continue
    }

    const correcta = resolverCorrecta(b, opciones, bloquesClave)
    if (correcta < 0) {
      incidencias.push(
        `${etiqueta}: no aparece su respuesta en el solucionario (¿anulada?). Márcala con «- [x]», con negrita, o con una línea «Respuesta: b».`,
      )
      continue
    }

    const meta = (clave: string) => b.meta.find((m) => m.clave === clave)?.valor ?? ''

    preguntas.push({
      enunciado: b.enunciado,
      opciones,
      correcta,
      explicacion: meta('explicacion') || b.citas.join(' '),
      fuente: meta('fuente') || b.encabezado || b.tituloSeccion,
    })
  }

  // Un solucionario con más respuestas que preguntas encontradas delata que
  // alguna se ha quedado por el camino (PDF mal extraído, formato raro…).
  // Es la única pista fiable de que falta algo, así que se avisa.
  for (const clave of bloquesClave) {
    const servidas = bloques.filter(
      (b) =>
        claveParaPregunta(bloquesClave, b.linea, b.numero, b.seccion, b.examen, b.orden) !== null &&
        esSuBloque(bloquesClave, b, clave),
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
  if (b.seccion) {
    const porT = bloques.filter((x) => titulosCasan(x.seccion, b.seccion))
    if (porT.length === 1) return porT[0] === clave
  }
  if (b.examen > 0) {
    const delTramo = bloques.filter((x) => x.examen === b.examen && x.orden === b.orden)
    if (delTramo.length === 1) return delTramo[0] === clave
    if (bloques.some((x) => x.examen === b.examen)) return false
  }
  if (b.seccion) {
    const porTitulo = bloques.filter((x) => titulosCasan(x.seccion, b.seccion))
    if (porTitulo.length === 1) return porTitulo[0] === clave
    if (porTitulo.length > 1) return false
    if (bloques.some((x) => x.seccion)) return false
  }
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
  const valor = b.meta.find((m) => m.clave === 'respuesta')?.valor

  // 4. Solucionario suelto, el que corresponda a la posición de la pregunta.
  if (!valor) {
    const porClave = claveParaPregunta(claves, b.linea, b.numero, b.seccion, b.examen, b.orden)
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
