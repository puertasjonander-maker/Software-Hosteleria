import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { EstadoVacio } from '@/components/ui/states'
import { GestionProductos, type ProductoVista } from './gestion-productos'

export const metadata: Metadata = { title: 'Productos' }
export const dynamic = 'force-dynamic'

export default async function PaginaProductos() {
  const supabase = createClient()

  const [productos, proveedores, locales, asignaciones] = await Promise.all([
    supabase.from('products').select('*').order('name'),
    supabase.from('suppliers').select('id, name').order('name'),
    supabase.from('locations').select('id, name').eq('active', true).order('name'),
    supabase.from('location_products').select('*'),
  ])

  if ((proveedores.data ?? []).length === 0) {
    return (
      <EstadoVacio
        titulo="Antes hacen falta proveedores"
        descripcion="Todo producto pertenece a un proveedor. Crea al menos uno para poder dar de alta productos."
      />
    )
  }

  const asignadoPor = new Map<string, Set<string>>()
  for (const a of asignaciones.data ?? []) {
    if (!a.active) continue
    const conjunto = asignadoPor.get(a.product_id) ?? new Set<string>()
    conjunto.add(a.location_id)
    asignadoPor.set(a.product_id, conjunto)
  }

  const vista: ProductoVista[] = (productos.data ?? []).map((p) => ({
    id: p.id,
    supplierId: p.supplier_id,
    nombre: p.name,
    categoria: p.category,
    unidadPedido: p.order_unit,
    unidadBase: p.base_unit,
    unidadesPorPedido: Number(p.units_per_order_unit),
    ultimoPrecio: p.last_known_price === null ? null : Number(p.last_known_price),
    activo: p.active,
    locales: [...(asignadoPor.get(p.id) ?? [])],
  }))

  return (
    <GestionProductos
      productos={vista}
      proveedores={(proveedores.data ?? []).map((s) => ({ id: s.id, nombre: s.name }))}
      locales={(locales.data ?? []).map((l) => ({ id: l.id, nombre: l.name }))}
    />
  )
}
