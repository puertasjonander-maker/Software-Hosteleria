import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSesion } from '@/lib/sesion'
import { inicioSegunRol } from '@/lib/roles'
import { useTitulo } from '@/components/cargador'

export default function SinPermiso() {
  useTitulo('Sin permiso')
  const { sesion } = useSesion()
  const destino = sesion ? inicioSegunRol(sesion.perfil.rol) : '/entrar'

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Lock className="h-10 w-10 text-muted-foreground" />
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Esta pantalla no es para tu rol</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Si necesitas acceso, pídenoslo: los permisos se cambian desde administración en un
          minuto.
        </p>
      </div>
      <Button asChild>
        <Link to={destino}>Volver a lo mío</Link>
      </Button>
    </main>
  )
}
