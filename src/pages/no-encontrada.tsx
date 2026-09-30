import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSesion } from '@/lib/sesion'
import { inicioSegunRol } from '@/lib/roles'
import { useTitulo } from '@/components/cargador'

/**
 * Una dirección que no existe.
 *
 * Con un enlace de vuelta y no solo un número: la mitad de las veces se llega
 * aquí desde un enlace viejo guardado en el móvil, y lo que hace falta es entrar,
 * no entender qué es un 404.
 */
export default function NoEncontrada() {
  useTitulo('No encontrada')
  const { sesion } = useSesion()

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Compass className="h-10 w-10 text-muted-foreground" />
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Aquí no hay nada</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Puede que la dirección haya cambiado o que lo que buscabas ya no exista.
        </p>
      </div>
      <Button asChild>
        <Link to={sesion ? inicioSegunRol(sesion.perfil.rol) : '/entrar'}>Volver a lo mío</Link>
      </Button>
    </main>
  )
}
