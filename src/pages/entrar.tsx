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
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,hsl(var(--accent))_0%,hsl(var(--background))_60%)] px-4 py-10">
      <div className="w-full max-w-sm space-y-8">
        <header className="space-y-3 text-center">
          <img
            src="/icons/icon.svg"
            alt=""
            className="mx-auto h-16 w-16 rounded-2xl shadow-lg shadow-primary/20"
          />
          <h1 className="text-[1.75rem] font-bold leading-none tracking-tight">Ergobox</h1>
          <p className="mx-auto max-w-[18rem] text-cuerpo text-muted-foreground">
            Mantenimiento de máquinas para boxes. Entra con el correo con el que te dimos de alta.
          </p>
        </header>

        <FormularioAcceso />
      </div>
    </main>
  )
}
