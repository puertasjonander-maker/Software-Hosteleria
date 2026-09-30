import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/**
 * Ergobox es una aplicación de una sola página: se descarga entera y habla
 * directamente con Supabase. No hay servidor propio y no hace falta ninguno —
 * quien decide qué puede ver cada usuario son las políticas de la base de datos,
 * y deciden lo mismo venga la consulta de donde venga.
 *
 * Por eso el build produce ficheros estáticos y se puede publicar en cualquier
 * hosting, incluido el compartido que ya tenemos.
 */
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },

  server: {
    port: 3000,
  },

  build: {
    outDir: 'dist',
    // Un mapa de fuentes en producción deja leer el código original. Aquí no hay
    // secretos —la clave anónima es pública por diseño— pero tampoco hay motivo
    // para publicar el código comentado.
    sourcemap: false,
  },
})
