import type { Metadata } from 'next'
import { WifiOff } from 'lucide-react'

export const metadata: Metadata = { title: 'Sin conexión' }

/**
 * Página que sirve el service worker cuando no hay red y la ruta no está en
 * caché. Deliberadamente sin JavaScript ni llamadas: tiene que renderizar
 * aunque no haya absolutamente nada disponible.
 */
export default function PaginaOffline() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <WifiOff className="h-10 w-10 text-muted-foreground" />
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Sin conexión</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Lo que hayas registrado en la visita está guardado en el móvil, fotos
          incluidas, y se subirá solo en cuanto vuelva la red. No hace falta que lo
          repitas.
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Puedes seguir trabajando: la app no necesita cobertura para registrar.
        </p>
      </div>
    </main>
  )
}
