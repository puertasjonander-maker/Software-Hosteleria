import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { exigirRol } from '@/lib/auth'
import { EstadoVacio } from '@/components/ui/states'
import { Simulador } from './simulador'

export const metadata: Metadata = { title: 'Simulador de precios' }
export const dynamic = 'force-dynamic'

export default async function PaginaSimulador() {
  await exigirRol('encargado', 'operador')
  const supabase = createClient()

  // Solo tiene sentido simular con productos que de verdad estén en algún
  // escandallo: el resto no afecta a ningún margen.
  const { data: lineas } = await supabase
    .from('recipe_lines')
    .select('product_id')
    .eq('mapping_status', 'mapeado')

  const ids = [...new Set((lineas ?? []).map((l) => l.product_id).filter(Boolean))] as string[]

  if (ids.length === 0) {
    return (
      <EstadoVacio
        titulo="Todavía no hay nada que simular"
        descripcion="El simulador trabaja sobre elaboraciones con ingredientes mapeados. Importa el escandallo y resuelve el mapeo primero."
      />
    )
  }

  const { data: productos } = await supabase
    .from('products')
    .select('id, name, order_unit')
    .in('id', ids)
    .order('name')

  return (
    <Simulador
      productos={(productos ?? []).map((p) => ({
        id: p.id,
        nombre: p.name,
        unidadPedido: p.order_unit,
      }))}
    />
  )
}
