import { Outlet } from 'react-router-dom'
import { useSesionActiva } from '@/lib/sesion'
import { Navegacion } from '@/components/navegacion'

/**
 * El marco de las pantallas con sesión: navegación arriba, barra abajo en el
 * móvil, y el contenido en medio.
 */
export function Marco() {
  const sesion = useSesionActiva()

  return (
    <div className="flex min-h-dvh flex-col">
      <Navegacion
        rol={sesion.perfil.rol}
        nombre={sesion.perfil.nombre || sesion.email || 'Sin nombre'}
        box={sesion.cliente?.nombre ?? null}
      />
      {/* pb-24 deja hueco a la barra inferior del móvil, que va fija. */}
      <main className="flex-1 pb-24 md:pb-8">
        <Outlet />
      </main>
    </div>
  )
}
