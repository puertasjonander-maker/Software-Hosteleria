import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { EstadoVacio } from '@/components/ui/states'
import { ImportadorCatalogo } from './importador'

export const metadata: Metadata = { title: 'Importar catálogo' }
export const dynamic = 'force-dynamic'

export default async function PaginaImportarCatalogo() {
  const supabase = createClient()

  const { data: locales } = await supabase
    .from('locations')
    .select('id, name')
    .eq('active', true)
    .order('name')

  if ((locales ?? []).length === 0) {
    return (
      <EstadoVacio
        titulo="Antes hay que crear los locales"
        descripcion="El CSV asigna cada producto a uno o varios locales por su nombre. Si no existen, no hay a dónde asignarlos."
        accion={
          <Button asChild>
            <Link href="/admin/locales">Crear locales</Link>
          </Button>
        }
      />
    )
  }

  return <ImportadorCatalogo locales={(locales ?? []).map((l) => l.name)} />
}
