import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { entornoActivo } from '../lib/entorno'

/**
 * Mantiene `?env=` en la URL mientras se navega.
 *
 * Sin esto, elegir entorno solo afecta a la primera página: React Router
 * reescribe la URL en cada navegación y se lleva por delante el parámetro, de
 * modo que GTM mide la primera vista en el entorno elegido y el resto en
 * producción, que es peor que no medir.
 *
 * Se reemplaza la entrada del historial en vez de empujar una nueva: así el
 * botón de atrás sigue haciendo lo que se espera y no hay que pasar dos veces
 * por cada página.
 */
export function MantenerEntorno() {
  const { pathname, search, hash } = useLocation()
  const navegar = useNavigate()

  useEffect(() => {
    const entorno = entornoActivo(search)
    if (!entorno) return

    const parametros = new URLSearchParams(search)
    if (parametros.get('env') === entorno) return

    parametros.set('env', entorno)
    navegar({ pathname, search: `?${parametros}`, hash }, { replace: true })
  }, [pathname, search, hash, navegar])

  return null
}
