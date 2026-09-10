import type { Metadata } from 'next'
import { exigirSesion } from '@/lib/auth'
import { EstadoVacio } from '@/components/ui/states'
import { PantallaPendiente } from '@/components/pantalla-pendiente'

export const metadata: Metadata = { title: 'Mi box' }

export default async function PaginaMiBox() {
  const sesion = await exigirSesion()

  /*
   * Un cliente sin box asignado no ve nada, y aquí lo decimos con palabras en vez
   * de con una lista vacía. Es el estado en el que nace un usuario recién invitado:
   * existe, entra, y todavía no está atado a ningún cliente.
   */
  if (sesion.perfil.rol === 'cliente' && !sesion.perfil.cliente_id) {
    return (
      <div className="container max-w-2xl py-6">
        <EstadoVacio
          titulo="Tu usuario todavía no está asociado a ningún box"
          descripcion="Escríbenos y lo dejamos listo en un minuto. Hasta entonces no hay nada que enseñarte aquí."
        />
      </div>
    )
  }

  return (
    <PantallaPendiente
      titulo="Mi box"
      fase="fase 4"
      descripcion="El parque del box con su semáforo, el historial de cada máquina y las fotos de cada servicio. Solo lectura."
    />
  )
}
