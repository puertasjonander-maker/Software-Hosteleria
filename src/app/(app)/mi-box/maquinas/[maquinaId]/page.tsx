import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { exigirSesion } from '@/lib/auth'
import { comoMaquinaFila } from '@/lib/parque'
import { cargarHistorico } from '@/lib/historico'
import { CabeceraMaquina } from '@/components/ficha-maquina'
import { HistoricoMaquina } from '@/components/historico-maquina'

export const metadata: Metadata = { title: 'Ficha de máquina' }
export const dynamic = 'force-dynamic'

/**
 * La ficha de una máquina como la ve su dueño (EBX-402, EBX-403).
 *
 * Misma cabecera y mismo historial que la pantalla interna, sin los botones de
 * editar y anotar. Las fotos llegan firmadas y caducan en una hora: la comprueba
 * Storage contra la política del bucket, no esta página.
 *
 * La consulta no filtra por box. Si un cliente pusiera aquí el id de una máquina
 * de otro box recibiría cero filas y un 404, porque la RLS resuelve la consulta
 * antes de que llegue nada. La prueba de aislamiento vive en
 * `scripts/probar-aislamiento.sql` y va contra la base de datos, no contra esto.
 */
export default async function PaginaMiMaquina({ params }: { params: { maquinaId: string } }) {
  const sesion = await exigirSesion()
  const supabase = createClient()

  const { data: fila } = await supabase
    .from('parque_estado')
    .select('*')
    .eq('id', params.maquinaId)
    .maybeSingle()

  if (!fila) notFound()

  const maquina = comoMaquinaFila(fila)
  const eventos = await cargarHistorico(maquina.id, {
    // Para un cliente no se piden los nombres de los técnicos: la política de
    // `perfiles` no se los daría, y quien firmó cada parte es asunto nuestro.
    conAutores: sesion.perfil.rol !== 'cliente',
  })

  return (
    <div className="container max-w-3xl space-y-4 py-4 md:py-6">
      <CabeceraMaquina maquina={maquina} />

      <section className="space-y-3">
        <h2 className="titulo-seccion">Historial</h2>
        <HistoricoMaquina eventos={eventos} />
      </section>
    </div>
  )
}
