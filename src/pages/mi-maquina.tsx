import { useParams } from 'react-router-dom'
import { useConsulta } from '@/lib/consulta'
import { useSesionActiva } from '@/lib/sesion'
import { obtenerMaquina } from '@/datos/parque'
import { cargarHistorico } from '@/datos/historico'
import { Cargador, useTitulo } from '@/components/cargador'
import { CabeceraMaquina } from '@/components/ficha-maquina'
import { HistoricoMaquina } from '@/components/historico-maquina'
import { Skeleton, SkeletonLista } from '@/components/ui/skeleton'

/**
 * La ficha de una máquina como la ve su dueño (EBX-402, EBX-403).
 *
 * Misma cabecera y mismo historial que la pantalla interna, sin los botones de
 * editar y anotar. Las fotos llegan firmadas y caducan en una hora: quien lo
 * comprueba es la política del bucket, no esta pantalla.
 *
 * La consulta no filtra por box. Si un cliente pusiera aquí el id de una máquina
 * de otro box no recibiría ninguna fila, porque la RLS resuelve la consulta antes
 * de que llegue nada. La prueba de eso vive en `scripts/probar-aislamiento.sql` y
 * va contra la base de datos, no contra esta pantalla.
 */
export default function MiMaquina() {
  const { maquinaId = '' } = useParams()
  const sesion = useSesionActiva()

  const consulta = useConsulta(
    async () => {
      const maquina = await obtenerMaquina(maquinaId)
      const eventos = await cargarHistorico(maquinaId, {
        // Para un cliente no se piden los nombres de los técnicos: la política de
        // `perfiles` no se los daría, y quién firmó cada parte es asunto nuestro.
        conAutores: sesion.perfil.rol !== 'cliente',
      })
      return { maquina, eventos }
    },
    [maquinaId, sesion.perfil.rol],
  )

  useTitulo(consulta.datos?.maquina.nombre ?? 'Ficha de máquina')

  return (
    <div className="container max-w-3xl space-y-4 py-4 md:py-6">
      <Cargador
        consulta={consulta}
        esqueleto={
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-16 w-full" />
            <SkeletonLista filas={4} />
          </div>
        }
      >
        {({ maquina, eventos }) => (
          <>
            <CabeceraMaquina maquina={maquina} />

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
