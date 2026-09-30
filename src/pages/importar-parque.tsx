import { useParams } from 'react-router-dom'
import { useConsulta } from '@/lib/consulta'
import { obtenerBox } from '@/datos/boxes'
import { contarMaquinas } from '@/datos/parque'
import { Cargador, useTitulo } from '@/components/cargador'
import { ImportadorParque } from '@/components/importador-parque'
import { Skeleton } from '@/components/ui/skeleton'

export default function ImportarParque() {
  useTitulo('Importar parque')
  const { id = '' } = useParams()

  const consulta = useConsulta(
    async () => {
      const [box, maquinas] = await Promise.all([obtenerBox(id), contarMaquinas(id)])
      return { box, maquinas }
    },
    [id],
  )

  return (
    <div className="container max-w-3xl space-y-4 py-4 md:py-6">
      <Cargador
        consulta={consulta}
        esqueleto={
          <div className="space-y-4">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-64 w-full" />
          </div>
        }
      >
        {({ box, maquinas }) => (
          <>
            <header className="hidden md:block">
              <h1 className="titulo-pantalla">Importar parque</h1>
              <p className="mt-1 texto-meta">{box.nombre}</p>
            </header>

            <ImportadorParque
              clienteId={box.id}
              clienteNombre={box.nombre}
              maquinasActuales={maquinas}
            />
          </>
        )}
      </Cargador>
    </div>
  )
}
