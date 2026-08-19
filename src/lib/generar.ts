import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { Pregunta } from '../types.ts'
import { idPregunta } from './store.ts'
import {
  cupoPorUnidad,
  verificarCobertura,
  type Cobertura,
  type Unidad,
} from './extraer.ts'

export const MODELO = 'claude-opus-5'

const EsquemaLote = z.object({
  preguntas: z.array(
    z.object({
      unidad_id: z.string(),
      fuente: z.string(),
      enunciado: z.string(),
      opciones: z.array(z.string()).length(4),
      correcta: z.number().int().min(0).max(3),
      explicacion: z.string(),
    }),
  ),
})

const SISTEMA = `Eres un redactor experto en preguntas tipo test para oposiciones y estudio normativo en español.

Trabajas SIEMPRE sobre los fragmentos que te entrega el usuario y cumples estas reglas sin excepción:

REGLA 1 — Preguntas originales.
Nunca reutilices, reformules ni copies preguntas que ya vengan dentro del documento. Si en un fragmento aparecen restos de un cuestionario previo (enunciados numerados con opciones "a) b) c) d)", solucionarios o plantillas de respuestas), ignóralos por completo: son ruido, no material. Todas tus preguntas deben nacer del texto normativo o expositivo, no de un test preexistente.

REGLA 2 — Cobertura total.
Debes generar preguntas para TODAS las unidades que te pasen, sin saltarte ninguna. Cada unidad lleva un identificador y un cupo de preguntas. Respeta el cupo de cada unidad y usa su identificador exacto en "unidad_id".

CALIDAD DE LAS PREGUNTAS
- Exactamente 4 opciones; una sola inequívocamente correcta según el texto.
- Los distractores deben ser plausibles y del mismo registro y longitud aproximada que la correcta: plazos cercanos, órganos afines, porcentajes similares, requisitos parecidos. Nada de opciones absurdas o de relleno.
- Varía la posición de la respuesta correcta entre preguntas.
- Prohibido "todas las anteriores", "ninguna de las anteriores" y opciones que se solapen entre sí.
- El enunciado se entiende por sí solo, sin referencias del tipo "según el fragmento anterior".
- Varía el tipo: literalidad de plazos y cifras, sujetos competentes, requisitos, excepciones, procedimiento, definiciones.
- "explicacion": una o dos frases que justifiquen la correcta citando la referencia concreta (artículo, apartado o epígrafe). Es lo que se le muestra al estudiante cuando falla.
- "fuente": la referencia corta de la unidad, por ejemplo "Artículo 34.2".
- Escribe en español, sin markdown y sin numerar los enunciados.`

function prompt(unidades: Unidad[], nombreTema: string): string {
  const bloques = unidades
    .map(
      (u) =>
        `<unidad id="${u.id}" titulo="${u.titulo}" cupo="${cupoPorUnidad(u)}">\n${u.texto}\n</unidad>`,
    )
    .join('\n\n')

  const total = unidades.reduce((n, u) => n + cupoPorUnidad(u), 0)

  return `Tema de estudio: ${nombreTema}

Genera preguntas tipo test a partir de las siguientes unidades. Cubre todas: no puede quedar ninguna sin preguntas.

${bloques}

Devuelve aproximadamente ${total} preguntas en total, repartidas según el cupo de cada unidad.`
}

/** Agrupa unidades para no mandar prompts gigantes ni uno por unidad. */
function lotes(unidades: Unidad[], maxCaracteres = 14000): Unidad[][] {
  const salida: Unidad[][] = []
  let actual: Unidad[] = []
  let largo = 0
  for (const u of unidades) {
    if (actual.length && largo + u.texto.length > maxCaracteres) {
      salida.push(actual)
      actual = []
      largo = 0
    }
    actual.push(u)
    largo += u.texto.length
  }
  if (actual.length) salida.push(actual)
  return salida
}

export type Progreso = (hecho: number, total: number, mensaje: string) => void

export type ResultadoGeneracion = {
  preguntas: Pregunta[]
  cobertura: Cobertura
}

async function pedirLote(
  client: Anthropic,
  unidades: Unidad[],
  nombreTema: string,
): Promise<z.infer<typeof EsquemaLote>['preguntas']> {
  const respuesta = await client.messages.parse({
    model: MODELO,
    max_tokens: 16000,
    system: SISTEMA,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'high',
      format: zodOutputFormat(EsquemaLote),
    },
    messages: [{ role: 'user', content: prompt(unidades, nombreTema) }],
  })
  return respuesta.parsed_output?.preguntas ?? []
}

/**
 * Genera un lote de preguntas cubriendo todas las unidades. Si tras la
 * primera pasada alguna unidad se ha quedado sin preguntas, se reintenta
 * individualmente antes de dar el resultado por bueno.
 */
export async function generarPreguntas(
  client: Anthropic,
  opciones: {
    temaId: string
    nombreTema: string
    unidades: Unidad[]
    onProgreso?: Progreso
  },
): Promise<ResultadoGeneracion> {
  const { temaId, nombreTema, unidades, onProgreso } = opciones
  const grupos = lotes(unidades)
  const crudas: z.infer<typeof EsquemaLote>['preguntas'] = []

  for (let i = 0; i < grupos.length; i++) {
    onProgreso?.(i, grupos.length + 1, `Generando lote ${i + 1} de ${grupos.length}…`)
    crudas.push(...(await pedirLote(client, grupos[i], nombreTema)))
  }

  const contar = () => {
    const mapa: Record<string, number> = {}
    for (const q of crudas) mapa[q.unidad_id] = (mapa[q.unidad_id] ?? 0) + 1
    return mapa
  }

  let cobertura = verificarCobertura(unidades, contar())
  if (cobertura.faltantes.length) {
    onProgreso?.(
      grupos.length,
      grupos.length + 1,
      `Completando ${cobertura.faltantes.length} unidad(es) sin preguntas…`,
    )
    for (const u of cobertura.faltantes) {
      crudas.push(...(await pedirLote(client, [u], nombreTema)))
    }
    cobertura = verificarCobertura(unidades, contar())
  }

  const vistos = new Set<string>()
  const preguntas: Pregunta[] = []
  for (const q of crudas) {
    if (q.opciones.length !== 4) continue
    if (new Set(q.opciones.map((o) => o.trim().toLowerCase())).size !== 4) continue
    const id = idPregunta(temaId, q.enunciado)
    if (vistos.has(id)) continue
    vistos.add(id)
    preguntas.push({
      id,
      tema_id: temaId,
      enunciado: q.enunciado.trim(),
      opciones: q.opciones.map((o) => o.trim()) as Pregunta['opciones'],
      correcta: q.correcta as Pregunta['correcta'],
      explicacion: q.explicacion.trim(),
      fuente: q.fuente.trim(),
    })
  }

  onProgreso?.(grupos.length + 1, grupos.length + 1, 'Listo')
  return { preguntas, cobertura }
}
