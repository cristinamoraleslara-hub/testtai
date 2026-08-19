import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Vite no lee PORT por su cuenta; hacerlo permite asignarle un puerto libre
  // desde fuera en lugar de pelearse por el 5173.
  server: process.env.PORT ? { port: Number(process.env.PORT) } : undefined,
})
