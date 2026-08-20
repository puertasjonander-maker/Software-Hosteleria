import { exigirSesion } from '@/lib/auth'
import { Navegacion } from '@/components/navegacion'
import { TransicionPagina } from '@/components/transicion-pagina'

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sesion = await exigirSesion()

  return (
    <div className="flex min-h-dvh flex-col">
      <Navegacion
        rol={sesion.profile.role}
        nombre={sesion.profile.full_name || sesion.email || 'Sin nombre'}
        local={sesion.location?.name ?? null}
      />
      {/* pb-24 deja hueco a la barra inferior del móvil, que va fija. */}
      <main className="flex-1 pb-24 md:pb-8">
        <TransicionPagina>{children}</TransicionPagina>
      </main>
    </div>
  )
}
