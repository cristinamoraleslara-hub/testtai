/**
 * Importación diferida a prueba de despliegues.
 *
 * La app se instala en el móvil y guarda el HTML en caché. Cuando se publica
 * una versión nueva, ese HTML viejo pide trozos de JavaScript que ya no
 * existen y la pantalla se queda a medias. La salida es recargar una vez para
 * traer el HTML nuevo; el guardián en sessionStorage evita el bucle si el
 * fallo era otro (sin cobertura, por ejemplo).
 */
const GUARDIAN = 'tai.recargadoPorChunk'

export function importarConRecarga<T>(cargar: () => Promise<T>): Promise<T> {
  return cargar().catch((error) => {
    const yaRecargado = sessionStorage.getItem(GUARDIAN)
    if (yaRecargado) {
      sessionStorage.removeItem(GUARDIAN)
      throw error
    }
    sessionStorage.setItem(GUARDIAN, '1')
    window.location.reload()
    // La recarga corta la ejecución; esta promesa nunca resuelve.
    return new Promise<T>(() => {})
  })
}
