/**
 * El entorno de medición (dev, qa, pre, pro) y cómo se mantiene al navegar.
 *
 * Se elige entrando con `?env=dev`. El problema es que esto es una SPA: en
 * cuanto se navega a otra ruta, React Router escribe una URL nueva y el
 * parámetro desaparece, así que GTM deja de ver el entorno a partir de la
 * segunda página. Por eso la elección se recuerda durante la sesión de la
 * pestaña y se vuelve a poner en la URL en cada cambio de ruta.
 *
 * Se usa `sessionStorage` y no `localStorage` a propósito: el entorno vale para
 * la pestaña en la que se está probando y no debe quedarse pegado para siempre
 * en el navegador, que es como se acaba midiendo producción como si fuera dev.
 */

export const ENTORNOS = ['dev', 'qa', 'pre', 'pro'] as const
export type Entorno = (typeof ENTORNOS)[number]

const CLAVE = 'entorno_medicion'

const valido = (v: string | null): v is Entorno =>
  v !== null && (ENTORNOS as readonly string[]).includes(v)

/** Lo que se guardó al entrar con `?env=`, si sigue habiendo sesión de pestaña. */
export function entornoRecordado(): Entorno | null {
  try {
    const v = sessionStorage.getItem(CLAVE)
    return valido(v) ? v : null
  } catch {
    // Navegación privada o almacenamiento bloqueado: sin memoria, pero sin romper.
    return null
  }
}

export function recordarEntorno(entorno: Entorno): void {
  try {
    sessionStorage.setItem(CLAVE, entorno)
  } catch {
    /* da igual: seguirá funcionando mientras el parámetro esté en la URL */
  }
}

/**
 * El entorno activo: manda el de la URL, y si no lo trae, el recordado.
 * Devuelve `null` cuando no se ha elegido ninguno, que es el caso normal.
 */
export function entornoActivo(busqueda: string): Entorno | null {
  const deLaUrl = new URLSearchParams(busqueda).get('env')
  if (valido(deLaUrl)) {
    recordarEntorno(deLaUrl)
    return deLaUrl
  }
  return entornoRecordado()
}
