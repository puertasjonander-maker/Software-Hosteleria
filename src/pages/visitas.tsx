import { useConsulta } from '@/lib/consulta'
import { cargarPantallaVisitas } from '@/datos/visitas'
import { Cargador, useTitulo } from '@/components/cargador'
import { ListaVisitas } from '@/components/lista-visitas'
import { Skeleton, SkeletonLista } from '@/components/ui/skeleton'

export default function Visitas() {
  useTitulo('Visitas')
  const consulta = useConsulta(cargarPantallaVisitas, [])

  return (
    <div className="container max-w-3xl space-y-4 py-4 md:py-6">
      <header className="hidden md:block">
        <h1 className="titulo-pantalla">Visitas</h1>
        <p className="mt-1 texto-meta">
          El trabajo de un día en un box. Se planifica con cobertura y se ejecuta sin ella.
        </p>
      </header>

      <Cargador
        consulta={consulta}
        esqueleto={
          <div className="space-y-4">
            <Skeleton className="h-11 w-48" />
            <SkeletonLista filas={5} />
          </div>
        }
      >
        {({ visitas, boxes }) => (
          <ListaVisitas visitas={visitas} boxes={boxes} />
        )}
      </Cargador>
    </div>
  )
}
