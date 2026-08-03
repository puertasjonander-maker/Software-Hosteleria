import Link from 'next/link'
import type { Metadata } from 'next'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inicioSegunRol, obtenerSesion } from '@/lib/auth'

export const metadata: Metadata = { title: 'Sin permiso' }

export default async function PaginaSinPermiso() {
  const sesion = await obtenerSesion()
  const destino = sesion ? inicioSegunRol(sesion.profile.role) : '/login'

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Lock className="h-10 w-10 text-muted-foreground" />
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Esta pantalla no es para tu rol</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Si necesitas acceso, pídeselo al operador: los permisos se cambian desde
          administración.
        </p>
      </div>
      <Button asChild>
        <Link href={destino}>Volver a lo mío</Link>
      </Button>
    </main>
  )
}
