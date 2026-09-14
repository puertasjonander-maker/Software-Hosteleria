import { useConsulta } from '@/lib/consulta'
import { useSesionActiva } from '@/lib/sesion'
import { listarUsuarios } from '@/datos/usuarios'
import { supabase } from '@/lib/supabase'
import { oReventar } from '@/datos/resultado'
import { Cargador, useTitulo } from '@/components/cargador'
import { GestionUsuarios } from '@/components/gestion-usuarios'
import { Skeleton, SkeletonLista } from '@/components/ui/skeleton'

/**
 * Usuarios y accesos (EBX-401).
 *
 * La única pantalla desde la que alguien pasa a ver los datos de un box. El
 * correo de cada usuario sale de `perfiles`, donde lo copia un trigger: antes se
 * leía de `auth.users` con la clave de servicio, y era la única razón por la que
 * una pantalla dependía de esa clave.
 */
export default function Administracion() {
  useTitulo('Administración')
  const sesion = useSesionActiva()

  const consulta = useConsulta(
    async () => {
      const [usuarios, boxes] = await Promise.all([
        listarUsuarios(sesion.userId),
        supabase
          .from('clientes')
          .select('id, nombre')
          .order('nombre')
          .then(oReventar),
      ])
      return { usuarios, boxes }
    },
    [sesion.userId],
  )

  return (
    <div className="container max-w-4xl space-y-4 py-4 md:py-6">
      <header className="space-y-1">
        <h1 className="titulo-pantalla">Administración</h1>
        <p className="texto-meta">
          Quién entra y qué alcanza. Un cliente solo ve su box, y solo lo ve si aquí se lo has
          asignado.
        </p>
      </header>

      <Cargador
        consulta={consulta}
        esqueleto={
          <div className="space-y-4">
            <Skeleton className="h-28 w-full" />
            <SkeletonLista filas={4} />
          </div>
        }
      >
        {({ usuarios, boxes }) => (
          <GestionUsuarios
            usuarios={usuarios}
            boxes={boxes}
            miId={sesion.userId}
            onCambio={consulta.recargar}
          />
        )}
      </Cargador>
    </div>
  )
}
