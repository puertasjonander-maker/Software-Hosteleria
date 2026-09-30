import { useConsulta } from '@/lib/consulta'
import { useSesionActiva } from '@/lib/sesion'
import { listarBoxes } from '@/datos/boxes'
import { Cargador, useTitulo } from '@/components/cargador'
import { GestionBoxes } from '@/components/gestion-boxes'
import { Skeleton, SkeletonLista } from '@/components/ui/skeleton'

export default function Boxes() {
  useTitulo('Boxes')
  const sesion = useSesionActiva()
  const consulta = useConsulta(listarBoxes, [])

  return (
    <div className="container max-w-4xl space-y-4 py-4 md:py-6">
      <header className="hidden md:block">
        <h1 className="titulo-pantalla">Boxes</h1>
        <p className="mt-1 texto-meta">
          Cada box con su parque. El semáforo es el de su máquina peor, no un promedio.
        </p>
      </header>

      <Cargador
        consulta={consulta}
        esqueleto={
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <SkeletonLista filas={5} />
          </div>
        }
      >
        {(boxes) => (
          <GestionBoxes
            boxes={boxes}
            puedeCrear={sesion.perfil.rol === 'admin'}
            onCambio={consulta.recargar}
          />
        )}
      </Cargador>
    </div>
  )
}
