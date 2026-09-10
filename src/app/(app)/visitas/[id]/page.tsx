import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { exigirRol } from '@/lib/auth'
import type { ParteRow, Semaforo, TipoMaquina } from '@/lib/database.types'
import { EstadoError } from '@/components/ui/states'
import { Trabajo, type ParteTrabajo } from './trabajo'

export const metadata: Metadata = { title: 'Visita' }

export const dynamic = 'force-dynamic'

export default async function PaginaVisita({ params }: { params: { id: string } }) {
  await exigirRol('admin', 'tecnico')
  const supabase = createClient()

  const { data: servicio, error } = await supabase
    .from('servicios')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (error) {
    return (
      <div className="container max-w-2xl py-6">
        <EstadoError descripcion="No hemos podido cargar la visita." />
      </div>
    )
  }
  if (!servicio) notFound()

  const [cliente, partes] = await Promise.all([
    supabase.from('clientes').select('nombre').eq('id', servicio.cliente_id).maybeSingle(),
    supabase
      .from('partes')
      .select('*, maquinas(nombre, tipo, marca, num_serie, ubicacion, estado)')
      .eq('servicio_id', params.id),
  ])

  /*
   * El `select` con relación anidada devuelve la máquina embebida. Se tipa a
   * mano porque `database.types.ts` está escrito sin relaciones: declararlas
   * todas para una consulta sería más ruido que valor.
   */
  type ParteConMaquina = ParteRow & {
    maquinas: {
      nombre: string
      tipo: TipoMaquina
      marca: string | null
      num_serie: string | null
      ubicacion: string | null
      estado: Semaforo
    } | null
  }

  const lista: ParteTrabajo[] = ((partes.data ?? []) as unknown as ParteConMaquina[])
    .filter((p) => p.maquinas !== null)
    .map((p) => ({
      id: p.id,
      maquinaId: p.maquina_id,
      nombre: p.maquinas!.nombre,
      tipo: p.maquinas!.tipo,
      marca: p.maquinas!.marca,
      numSerie: p.maquinas!.num_serie,
      ubicacion: p.maquinas!.ubicacion,
      estadoMaquina: p.maquinas!.estado,
      trabajoHecho: p.trabajo_hecho,
      piezas: p.piezas,
      estadoAntes: p.estado_antes,
      estadoDespues: p.estado_despues,
      damper: p.damper,
      dragFactor: p.drag_factor,
      minutos: p.minutos,
      hecho: p.hecho,
    }))

  return (
    <Trabajo
      servicioId={servicio.id}
      clienteId={servicio.cliente_id}
      clienteNombre={cliente.data?.nombre ?? 'Box'}
      fecha={servicio.fecha}
      estado={servicio.estado}
      notas={servicio.notas}
      partes={lista}
    />
  )
}
