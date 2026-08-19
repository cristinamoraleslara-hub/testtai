import { NavLink, Outlet } from 'react-router-dom'
import { useDatos } from '../hooks/useDatos'
import { MetaDiaria } from './MetaDiaria'

const enlaces = [
  { a: '/', texto: 'Estudiar' },
  { a: '/estadisticas', texto: 'Progreso' },
  { a: '/importar', texto: 'Contenido' },
]

export function Layout() {
  const { store, email } = useDatos()

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-[var(--color-borde)] bg-[var(--color-lienzo)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <span className="text-base font-semibold tracking-tight">TAI Tests</span>
            <span className="ml-2 text-[11px] text-slate-500">
              {store.modo === 'nube' ? (email ?? 'sincronizado') : 'solo en este dispositivo'}
            </span>
          </div>
          <MetaDiaria compacto />
        </div>
        <nav className="mx-auto flex max-w-3xl gap-1 px-2 pb-2">
          {enlaces.map((e) => (
            <NavLink
              key={e.a}
              to={e.a}
              end={e.a === '/'}
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-sm ${
                  isActive
                    ? 'bg-[var(--color-panel-alto)] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`
              }
            >
              {e.texto}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5">
        <Outlet />
      </main>
    </div>
  )
}
