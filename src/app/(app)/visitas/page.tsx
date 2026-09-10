import type { Metadata } from 'next'
import { exigirRol } from '@/lib/auth'
import { PantallaPendiente } from '@/components/pantalla-pendiente'

export const metadata: Metadata = { title: 'Visitas' }

export default async function PaginaVisitas() {
  await exigirRol('admin', 'tecnico')

  return (
    <PantallaPendiente
      titulo="Visitas"
      fase="fase 2"
      descripcion="La pantalla que se usa dentro del box: las máquinas del día, la ficha de cada una, las fotos de antes y después, y marcar terminada. Funcionará sin cobertura."
    />
  )
}
