import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { GestionProveedores, type ProveedorVista } from './gestion-proveedores'

export const metadata: Metadata = { title: 'Proveedores' }
export const dynamic = 'force-dynamic'

export default async function PaginaProveedores() {
  const supabase = createClient()

  const [proveedores, pautas, productos] = await Promise.all([
    supabase.from('suppliers').select('*').order('name'),
    supabase.from('supplier_schedules').select('*'),
    supabase.from('products').select('supplier_id').eq('active', true),
  ])

  const productosPorProveedor = new Map<string, number>()
  for (const p of productos.data ?? []) {
    productosPorProveedor.set(p.supplier_id, (productosPorProveedor.get(p.supplier_id) ?? 0) + 1)
  }

  const vista: ProveedorVista[] = (proveedores.data ?? []).map((s) => ({
    id: s.id,
    nombre: s.name,
    canal: s.contact_channel,
    contacto: s.contact_value,
    notas: s.notes,
    activo: s.active,
    productos: productosPorProveedor.get(s.id) ?? 0,
    pautas: (pautas.data ?? [])
      .filter((p) => p.supplier_id === s.id)
      .map((p) => ({
        id: p.id,
        orderWeekday: p.order_weekday,
        // Postgres devuelve 'HH:MM:SS'; el input type=time quiere 'HH:MM'.
        cutoffTime: p.cutoff_time.slice(0, 5),
        deliveryWeekday: p.delivery_weekday,
        leadTimeDays: p.lead_time_days,
      }))
      .sort((a, b) => a.orderWeekday - b.orderWeekday),
  }))

  return <GestionProveedores proveedores={vista} />
}
