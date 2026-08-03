import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { GestionLocales } from './gestion-locales'

export const metadata: Metadata = { title: 'Locales' }
export const dynamic = 'force-dynamic'

export default async function PaginaLocales() {
  const supabase = createClient()

  const { data: locales } = await supabase.from('locations').select('*').order('name')

  const { data: asignaciones } = await supabase
    .from('location_products')
    .select('location_id')
    .eq('active', true)

  const productosPorLocal = new Map<string, number>()
  for (const a of asignaciones ?? []) {
    productosPorLocal.set(a.location_id, (productosPorLocal.get(a.location_id) ?? 0) + 1)
  }

  return (
    <GestionLocales
      locales={(locales ?? []).map((l) => ({
        id: l.id,
        nombre: l.name,
        activo: l.active,
        productos: productosPorLocal.get(l.id) ?? 0,
      }))}
    />
  )
}
