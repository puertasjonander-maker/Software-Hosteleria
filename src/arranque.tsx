import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ProveedorSesion } from '@/lib/sesion'
import { registrarServiceWorker } from '@/lib/service-worker'
import { Rutas } from '@/rutas'
import '@/globals.css'

const raiz = document.getElementById('raiz')
if (!raiz) throw new Error('Falta el nodo #raiz en index.html')

createRoot(raiz).render(
  <StrictMode>
    <BrowserRouter>
      <ProveedorSesion>
        <Rutas />
        {/* Arriba y no abajo: en el móvil la barra de navegación ocupa el borde
            inferior y un aviso ahí se lee encima de los botones. */}
        <Toaster position="top-center" richColors closeButton />
      </ProveedorSesion>
    </BrowserRouter>
  </StrictMode>,
)

registrarServiceWorker()
