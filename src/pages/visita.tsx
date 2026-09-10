import { useParams } from 'react-router-dom'
import { useConsulta } from '@/lib/consulta'
import { obtenerVisita } from '@/datos/visitas'
import { Cargador, useTitulo } from '@/components/cargador'
import { Trabajo } from '@/components/visita/trabajo'
import { Skeleton, SkeletonLista } from '@/components/ui/skeleton'

export default function Visita() {
  const { id = '' } = useParams()
  const consulta = useConsulta(() => obtenerVisita(id), [id])

  useTitulo(consulta.datos ? `Visita · ${consulta.datos.clienteNombre}` : 'Visita')

  return (
    <Cargador
      consulta={consulta}
      esqueleto={
        <div className="container max-w-2xl space-y-4 py-4 md:py-6">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-40" />
          <SkeletonLista filas={6} />
        </div>
      }
    >
      {(visita) => <Trabajo visita={visita} onCambio={consulta.recargar} />}
    </Cargador>
  )
}
