import { useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Acceso con correo y contraseña.
 *
 * La contraseña NO está en el código: eso sería inútil, porque este bundle es
 * público y cualquiera puede leerlo. La comprueba el servidor de Supabase, y
 * lo que protege los datos son las políticas RLS atadas a tu usuario.
 *
 * No hay registro: el usuario se crea a mano desde el panel de Supabase, así
 * el registro público puede quedarse desactivado y nadie más puede entrar.
 */
export function Acceso() {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  function explicar(error: { message: string; status?: number }): string {
    const m = error.message.toLowerCase()
    if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed')) {
      return 'No se ha podido contactar con la base de datos. Si el proyecto de Supabase lleva días sin usarse, estará pausado: entra en supabase.com y pulsa "Restore".'
    }
    if (m.includes('invalid login credentials')) {
      return 'Correo o contraseña incorrectos.'
    }
    if (m.includes('email not confirmed')) {
      return 'Ese usuario está sin confirmar. En Supabase → Authentication → Users, edítalo y marca el correo como confirmado.'
    }
    if (error.status === 429 || m.includes('rate limit') || m.includes('security purposes')) {
      return 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.'
    }
    return error.message
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setEntrando(true)
    setMensaje('')
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: clave,
      })
      if (error) setMensaje(explicar(error))
      // Si va bien, onAuthStateChange cambia la pantalla solo.
    } catch (err) {
      setMensaje(explicar({ message: err instanceof Error ? err.message : String(err) }))
    } finally {
      setEntrando(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">TAI Tests</h1>
      <p className="mt-1 text-sm text-slate-400">
        Entra una vez en cada dispositivo. La sesión se queda guardada.
      </p>

      <form onSubmit={entrar} className="mt-6 space-y-3">
        <input
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@correo.com"
          className="w-full rounded-xl border border-[var(--color-borde)] bg-[var(--color-panel)] px-3 py-3 text-sm outline-none focus:border-[var(--color-acento)]"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          placeholder="Tu contraseña"
          className="w-full rounded-xl border border-[var(--color-borde)] bg-[var(--color-panel)] px-3 py-3 text-sm outline-none focus:border-[var(--color-acento)]"
        />
        <button
          disabled={entrando}
          className="w-full rounded-xl bg-[var(--color-acento)] py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {entrando ? 'Entrando…' : 'Entrar'}
        </button>
        {mensaje && <p className="text-sm text-[var(--color-fallo)]">{mensaje}</p>}
      </form>

      <p className="mt-6 text-[11px] leading-relaxed text-slate-500">
        Tu usuario se crea desde el panel de Supabase. Si olvidas la contraseña, se cambia
        ahí mismo en Authentication → Users.
      </p>
    </div>
  )
}
