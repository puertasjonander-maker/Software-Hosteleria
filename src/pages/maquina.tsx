import { useParams } from 'react-router-dom'
import { useConsulta } from '@/lib/consulta'
import { obtenerMaquina } from '@/datos/parque'
import { cargarHistorico } from '@/datos/historico'
import { Cargador, useTitulo } from '@/components/cargador'
import { CabeceraMaquina } from '@/components/ficha-maquina'
import { ControlesMaquina } from '@/components/controles-maquina'
import { HistoricoMaquina } from '@/components/historico-maquina'
import { Skeleton, SkeletonLista } from '@/components/ui/skeleton'

/**
 * Ficha de máquina con su historial (EBX-301, EBX-104).
 *
 * La comprobación de que la máquina es de este box no es cosmética: sin ella,
 * `/boxes/<box A>/maquinas/<máquina de B>` pintaría la ficha de B bajo la
 * cabecera de A para un interno, que alcanza a los dos. No es una fuga de datos
 * —un técnico ve los dos boxes— pero sí una manera de anotar en la máquina
 * equivocada.
 */
export default function Maquina() {
  const { id = '', maquinaId = '' } = useParams()

  const consulta = useConsulta(
    async () => {
      const maquina = await obtenerMaquina(maquinaId)
      const eventos = await cargarHistorico(maquinaId, { conAutores: true })
      return { maquina, eventos }
    },
    [maquinaId],
  )

  useTitulo(consulta.datos?.maquina.nombre ?? 'Máquina')

  return (
    <div className="container max-w-3xl space-y-4 py-4 md:py-6">
      <Cargador
        consulta={consulta}
        esqueleto={
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-9 w-56" />
            <SkeletonLista filas={4} />
          </div>
        }
      >
        {({ maquina, eventos }) => (
          <>
            <CabeceraMaquina maquina={maquina} />

            <ControlesMaquina
              clienteId={id}
              maquina={maquina}
              onCambio={consulta.recargar}
            />

            <section className="space-y-3">
              <h2 className="titulo-seccion">Historial</h2>
              <HistoricoMaquina eventos={eventos} />
            </section>
          </>
        )}
      </Cargador>
    </div>
  )
}
