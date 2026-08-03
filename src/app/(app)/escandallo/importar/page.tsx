import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { exigirRol } from '@/lib/auth'
import { EstadoVacio } from '@/components/ui/states'
import { ImportadorEscandallo } from './importador'

export const metadata: Metadata = { title: 'Importar escandallo' }
export const dynamic = 'force-dynamic'

export default async function PaginaImportar() {
  await exigirRol('operador')
  const supabase = createClient()

  const { count } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('active', true)

  // Sin catálogo, el emparejado automático no tiene contra qué emparejar y todo
  // entraría 'sin_mapear'. Mejor decirlo antes que después de subir el fichero.
  if (!count || count === 0) {
    return (
      <EstadoVacio
        titulo="Antes hay que cargar el catálogo"
        descripcion="El importador empareja cada ingrediente del Excel con un producto del catálogo de compras. Sin productos dados de alta, todas las líneas quedarían sin mapear."
      />
    )
  }

  return <ImportadorEscandallo productosEnCatalogo={count} />
}
