import { useParams } from 'react-router-dom'
import { useConsulta } from '@/lib/consulta'
import { obtenerVisita } from '@/datos/visitas'
import { guardarVisitaLocal, leerVisitaLocal } from '@/lib/cola-visita'
import { conTiempoLimite, ESPERA_MAXIMA_MS, hayRed } from '@/lib/red'
import { Cargador, useTitulo } from '@/components/cargador'
import { Trabajo } from '@/components/visita/trabajo'
import { Skeleton, SkeletonLista } from '@/components/ui/skeleton'

/**
 * La visita, con red o sin ella (EBX-202 y EBX-205).
 *
 * La pantalla se construía entera desde el servidor, y dentro de un box eso la
 * dejaba a merced de la red: iOS recarga la pestaña al volver de la cámara o
 * cuando necesita memoria, y con la recarga aparecía un error en vez de la lista
 * de máquinas. Aquí se guarda el retrato de la última lectura buena y, si el
 * servidor no contesta, se enseña el retrato y se dice que es un retrato. Lo que
 * el técnico registre se encola igual, así que puede seguir trabajando.
 */
export default function Visita() {
  const { id = '' } = useParams()

  const consulta = useConsulta(
    async () => {
      const guardada = () => leerVisitaLocal(id)

      /*
       * Sin cobertura no se llama al servidor: se pinta el retrato. Esperar a que
       * supabase-js se rinda son tres reintentos, y eso de pie delante de una
       * máquina abierta es la aplicación rota.
       */
      if (!hayRed()) {
        const retrato = await guardada()
        if (retrato) return { visita: retrato, delRetrato: true }
      }

      try {
        const visita = await conTiempoLimite(obtenerVisita(id), ESPERA_MAXIMA_MS)
        // El retrato se guarda sin esperarlo: no puede retrasar la pantalla.
        void guardarVisitaLocal(visita)
        return { visita, delRetrato: false }
      } catch (e) {
        const retrato = await guardada()
        if (retrato) return { visita: retrato, delRetrato: true }
        throw e
      }
    },
    [id],
  )

  useTitulo(consulta.datos ? `Visita · ${consulta.datos.visita.clienteNombre}` : 'Visita')

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
      {({ visita, delRetrato }) => (
        <Trabajo
          visita={visita}
          delRetrato={delRetrato}
          onCambio={consulta.recargar}
        />
      )}
    </Cargador>
  )
}
