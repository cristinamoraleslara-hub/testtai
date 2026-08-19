import { useEffect, useInsertionEffect, useRef } from 'react'
import { useDatos } from './useDatos'

const VOLCADO_CADA = 15

/**
 * Cuenta el tiempo real de estudio mientras `activo` y la pestaña está
 * visible, y lo vuelca a la base de datos cada 15s (y al salir).
 */
export function useTiempoEstudio(activo: boolean) {
  const { sumarTiempo } = useDatos()
  const pendiente = useRef(0)
  const sumar = useRef(sumarTiempo)
  useInsertionEffect(() => {
    sumar.current = sumarTiempo
  })

  useEffect(() => {
    if (!activo) return

    const volcar = () => {
      if (pendiente.current <= 0) return
      const s = pendiente.current
      pendiente.current = 0
      sumar.current(s)
    }

    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      pendiente.current += 1
      if (pendiente.current >= VOLCADO_CADA) volcar()
    }, 1000)

    window.addEventListener('pagehide', volcar)
    return () => {
      clearInterval(id)
      window.removeEventListener('pagehide', volcar)
      volcar()
    }
  }, [activo])
}
