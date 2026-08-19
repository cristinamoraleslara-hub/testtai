import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function Acceso() {
  const [email, setEmail] = useState('')
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'enviado' | 'error'>('idle')
  const [mensaje, setMensaje] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setEstado('enviando')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      setEstado('error')
      setMensaje(error.message)
    } else {
      setEstado('enviado')
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
