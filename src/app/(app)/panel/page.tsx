import type { Metadata } from 'next'
import { exigirRol } from '@/lib/auth'
import { PantallaPendiente } from '@/components/pantalla-pendiente'

export const metadata: Metadata = { title: 'Panel' }

export default async function PaginaPanel() {
  await exigirRol('admin')

  return (
    <PantallaPendiente
      titulo="Panel"
      fase="fase 3"
      descripcion="Estado del parque de todos los boxes de un vistazo, revisiones vencidas y próximas, y servicios por periodo."
    />
  )
}
