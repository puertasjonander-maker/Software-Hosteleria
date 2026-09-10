import type { Metadata } from 'next'
import { exigirRol } from '@/lib/auth'
import { PantallaPendiente } from '@/components/pantalla-pendiente'

export const metadata: Metadata = { title: 'Boxes' }

export default async function PaginaClientes() {
  await exigirRol('admin', 'tecnico')

  return (
    <PantallaPendiente
      titulo="Boxes"
      fase="fase 1"
      descripcion="Alta de boxes, alta de máquinas e importación del parque desde CSV. Se probará metiendo las doce de IronBuster."
    />
  )
}
