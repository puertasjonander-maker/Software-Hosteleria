import { Navigate, useLocation } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { inicioSegunRol } from '@/lib/roles'
import { useTitulo } from '@/components/cargador'
import { FormularioAcceso } from '@/components/formulario-acceso'

export default function Entrar() {
  useTitulo('Entrar')
  const { sesion, cargando } = useSesion()
  const ubicacion = useLocation()

  // Quien ya está dentro no vuelve a ver el formulario. El destino guardado por
  // el guarda de ruta manda: se aterriza donde se iba, no en el inicio.
  if (!cargando && sesion) {
    const destino =
      (ubicacion.state as { destino?: string } | null)?.destino ??
      inicioSegunRol(sesion.perfil.rol)
    return <Navigate to={destino} replace />
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-8">
        <header className="space-y-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">
            E
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Ergobox</h1>
          <p className="text-sm text-muted-foreground">
            Mantenimiento de máquinas. Entra con el correo con el que te dimos de alta.
          </p>
        </header>

        <FormularioAcceso />
      </div>
    </main>
  )
}
