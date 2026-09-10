import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { exigirRol } from '@/lib/auth'
import { comoMaquinaFila } from '@/lib/parque'
import { cargarHistorico } from '@/lib/historico'
import { CabeceraMaquina } from '@/components/ficha-maquina'
import { HistoricoMaquina } from '@/components/historico-maquina'
import { ControlesMaquina } from './controles'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { maquinaId: string }
}): Promise<Metadata> {
  const supabase = createClient()
  const { data } = await supabase
    .from('maquinas')
    .select('nombre')
    .eq('id', params.maquinaId)
    .maybeSingle()
  return { title: data?.nombre ?? 'Máquina' }
}

/**
 * Ficha de máquina con su historial (EBX-301, EBX-104).
 *
 * La comprobación de que la máquina es de este box no es cosmética aquí: sin
 * ella, `/clientes/<box A>/maquinas/<máquina de B>` pintaría la ficha de B bajo
 * la cabecera de A para un interno, que alcanza a los dos. No es una fuga de
 * datos —un técnico ve los dos boxes— pero sí una manera de anotar en la máquina
 * equivocada.
 */
export default async function PaginaMaquina({
  params,
}: {
  params: { id: string; maquinaId: string }
}) {
  await exigirRol('admin', 'tecnico')
  const supabase = createClient()

  const { data: fila } = await supabase
    .from('parque_estado')
    .select('*')
    .eq('id', params.maquinaId)
    .eq('cliente_id', params.id)
    .maybeSingle()

  if (!fila) notFound()

  const maquina = comoMaquinaFila(fila)
  const eventos = await cargarHistorico(maquina.id, { conAutores: true })

  return (
    <div className="container max-w-3xl space-y-4 py-4 md:py-6">
      <CabeceraMaquina maquina={maquina} />

      <ControlesMaquina clienteId={params.id} maquina={maquina} />

      <section className="space-y-3">
        <h2 className="titulo-seccion">Historial</h2>
        <HistoricoMaquina eventos={eventos} />
      </section>
    </div>
  )
}
