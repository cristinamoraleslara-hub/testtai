import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function Acceso() {
  const [email, setEmail] = useState('')
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'enviado' | 'error'>('idle')
  const [mensaje, setMensaje] = useState('')

  /**
   * El plan gratuito de Supabase pausa el proyecto tras unos días sin uso, y
   * entonces la petición falla en red con un escueto «Failed to fetch». Merece
   * la pena traducirlo a algo accionable en vez de soltar el error crudo.
   */
  function explicar(error: { message: string; status?: number }): string {
    const m = error.message.toLowerCase()
    if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed')) {
      return 'No se ha podido contactar con la base de datos. Si el proyecto de Supabase lleva días sin usarse, estará pausado: entra en supabase.com y pulsa "Restore". Comprueba también que VITE_SUPABASE_URL es correcta.'
    }
    if (error.status === 429 || m.includes('rate limit') || m.includes('security purposes')) {
      return 'Demasiados intentos seguidos. Espera un minuto y vuelve a pedir el enlace.'
    }
    if (m.includes('invalid') && m.includes('email')) {
      return 'Ese correo no parece válido.'
    }
    if (m.includes('redirect')) {
      return 'La URL de esta web no está autorizada en Supabase. Añádela en Authentication → URL Configuration → Redirect URLs.'
    }
    return error.message
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setEstado('enviando')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) {
        setEstado('error')
        setMensaje(explicar(error))
      } else {
        setEstado('enviado')
      }
    } catch (e) {
      setEstado('error')
      setMensaje(explicar({ message: e instanceof Error ? e.message : String(e) }))
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">TAI Tests</h1>
      <p className="mt-1 text-sm text-slate-400">
        Entra con tu correo para sincronizar el progreso entre el móvil y el ordenador.
      </p>

      {estado === 'enviado' ? (
        <p className="mt-6 rounded-xl border border-[var(--color-acierto)]/40 bg-[var(--color-acierto)]/10 p-4 text-sm">
          Te hemos enviado un enlace a <strong>{email}</strong>. Ábrelo en este mismo dispositivo.
        </p>
      ) : (
        <form onSubmit={enviar} className="mt-6 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            className="w-full rounded-xl border border-[var(--color-borde)] bg-[var(--color-panel)] px-3 py-3 text-sm outline-none focus:border-[var(--color-acento)]"
          />
          <button
            disabled={estado === 'enviando'}
            className="w-full rounded-xl bg-[var(--color-acento)] py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {estado === 'enviando' ? 'Enviando…' : 'Enviarme el enlace'}
          </button>
          {estado === 'error' && <p className="text-sm text-[var(--color-fallo)]">{mensaje}</p>}
        </form>
      )}
    </div>
  )
}
