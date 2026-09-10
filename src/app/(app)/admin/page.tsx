import type { Metadata } from 'next'
import { exigirRol } from '@/lib/auth'
import { PantallaPendiente } from '@/components/pantalla-pendiente'

export const metadata: Metadata = { title: 'Administración' }

export default async function PaginaAdmin() {
  await exigirRol('admin')

  return (
    <PantallaPendiente
      titulo="Administración"
      fase="fase 4"
      descripcion="Usuarios y accesos. Aquí es donde se invita al dueño de un box y se le ata a su cliente: es el único sitio desde el que alguien pasa a ver datos de un box."
    />
  )
}
