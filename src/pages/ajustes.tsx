import { useSesionActiva } from '@/lib/sesion'
import { ETIQUETA_ROL } from '@/lib/roles'
import { useTitulo } from '@/components/cargador'
import { ActivarAvisos } from '@/components/activar-avisos'

/**
 * Los ajustes de quien está dentro.
 *
 * Hoy solo tiene los avisos. Es una pantalla y no un diálogo del menú porque lo
 * que hay aquí se consulta desde un móvil concreto para saber cómo está ese
 * móvil, y eso quiere una dirección a la que volver.
 */
export default function Ajustes() {
  useTitulo('Ajustes')
  const sesion = useSesionActiva()

  return (
    <div className="container max-w-2xl space-y-5 py-4 md:py-6">
      <header className="space-y-1">
        <h1 className="titulo-pantalla">Ajustes</h1>
        <p className="texto-meta">
          {sesion.perfil.nombre || sesion.email} · {ETIQUETA_ROL[sesion.perfil.rol]}
        </p>
      </header>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="titulo-seccion">Avisos de revisión</h2>
        <ActivarAvisos />
      </section>
    </div>
  )
}
