import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProveedorDatos, useDatos } from './hooks/useDatos'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { Test } from './pages/Test'
import { Estadisticas } from './pages/Estadisticas'
import { Preguntas } from './pages/Preguntas'
import { Acceso } from './pages/Acceso'

const Contenido = lazy(() =>
  import('./pages/Contenido').then((m) => ({ default: m.Contenido })),
)

function Rutas() {
  const { necesitaAcceso, sesionResuelta } = useDatos()

  if (!sesionResuelta) return null
  if (necesitaAcceso) return <Acceso />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="test" element={<Test />} />
        <Route path="estadisticas" element={<Estadisticas />} />
        <Route path="preguntas" element={<Preguntas />} />
        <Route
          path="importar"
          element={
            <Suspense fallback={<p className="text-slate-400">Cargando…</p>}>
              <Contenido />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ProveedorDatos>
        <Rutas />
      </ProveedorDatos>
    </BrowserRouter>
  )
}
