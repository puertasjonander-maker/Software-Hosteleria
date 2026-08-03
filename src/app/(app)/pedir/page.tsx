import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { exigirSesion } from '@/lib/auth'
import { calcularCorte } from '@/lib/cutoff'
import { EstadoError, EstadoVacio } from '@/components/ui/states'
import { SelectorLocal } from '@/components/selector-local'
import { ListaPedir, type ProductoPedible } from './lista-pedir'

export const metadata: Metadata = { title: 'Pedir' }

// La lista tiene que reflejar lo que se acaba de registrar, incluido desde otro
// móvil del mismo local. Nada de caché de ruta.
export const dynamic = 'force-dynamic'

export default async function PaginaPedir({
  searchParams,
}: {
  searchParams: { local?: string }
}) {
  const sesion = await exigirSesion()
  const supabase = createClient()

  // El barista pide siempre para su local. Encargado y operador eligen, porque
  // cubren los tres.
  const esBarista = sesion.profile.role === 'barista'
  const { data: locales } = await supabase
    .from('locations')
    .select('*')
    .eq('active', true)
    .order('name')

  const localesDisponibles = locales ?? []
  const localId = esBarista
    ? sesion.profile.location_id
    : (searchParams.local ?? localesDisponibles[0]?.id ?? null)

  if (esBarista && !localId) {
    return (
      <div className="container max-w-2xl py-6">
        <EstadoVacio
          titulo="Tu usuario no tiene local asignado"
          descripcion="Sin local no se puede saber para dónde estás pidiendo. Pídeselo al operador: se arregla en un minuto desde administración."
        />
      </div>
    )
  }

  if (!localId) {
    return (
      <div className="container max-w-2xl py-6">
        <EstadoVacio
          titulo="Todavía no hay locales dados de alta"
          descripcion="El operador tiene que crear al menos un local antes de poder pedir."
        />
      </div>
    )
  }

  if (!esBarista && !searchParams.local && localesDisponibles.length > 0) {
    redirect(`/pedir?local=${localesDisponibles[0].id}`)
  }

  // Consultas simples y unión en memoria: el catálogo son cientos de filas, no
  // millones, y así cada permiso de RLS se comprueba sobre una tabla concreta.
  const [asignados, proveedores, pautas, solicitudes] = await Promise.all([
    supabase
      .from('location_products')
      .select('product_id, par_level')
      .eq('location_id', localId)
      .eq('active', true),
    supabase.from('suppliers').select('*').eq('active', true),
    supabase.from('supplier_schedules').select('*'),
    supabase
      .from('requests')
      .select('id, product_id, qty, requested_by, note')
      .eq('location_id', localId)
      .eq('status', 'pendiente')
      .is('order_id', null),
  ])

  if (asignados.error) {
    return (
      <div className="container max-w-2xl py-6">
        <EstadoError descripcion="No hemos podido cargar el catálogo de tu local." />
      </div>
    )
  }

  const idsAsignados = (asignados.data ?? []).map((a) => a.product_id)

  const { data: productos } = idsAsignados.length
    ? await supabase
        .from('products')
        .select('*')
        .in('id', idsAsignados)
        .eq('active', true)
        .order('category')
        .order('name')
    : { data: [] }

  const porProveedor = new Map((proveedores.data ?? []).map((s) => [s.id, s]))
  const pautasPorProveedor = new Map<string, typeof pautas.data>()
  for (const pauta of pautas.data ?? []) {
    const lista = pautasPorProveedor.get(pauta.supplier_id) ?? []
    lista.push(pauta)
    pautasPorProveedor.set(pauta.supplier_id, lista)
  }

  const misSolicitudes = new Map<string, number>()
  const totalesLocal = new Map<string, number>()
  for (const s of solicitudes.data ?? []) {
    totalesLocal.set(s.product_id, (totalesLocal.get(s.product_id) ?? 0) + Number(s.qty))
    if (s.requested_by === sesion.userId) {
      misSolicitudes.set(s.product_id, (misSolicitudes.get(s.product_id) ?? 0) + Number(s.qty))
    }
  }

  const items: ProductoPedible[] = (productos ?? []).map((p) => {
    const proveedor = porProveedor.get(p.supplier_id)
    const corte = calcularCorte(pautasPorProveedor.get(p.supplier_id) ?? [])

    return {
      id: p.id,
      nombre: p.name,
      categoria: p.category,
      unidadPedido: p.order_unit,
      proveedorId: p.supplier_id,
      proveedorNombre: proveedor?.name ?? 'Proveedor desconocido',
      miCantidad: misSolicitudes.get(p.id) ?? 0,
      cantidadLocal: totalesLocal.get(p.id) ?? 0,
      corte: {
        estado: corte.estado,
        minutosHasta: corte.minutosHasta,
        etiqueta: corte.etiqueta,
      },
    }
  })

  const local = localesDisponibles.find((l) => l.id === localId)

  return (
    <div className="container max-w-2xl space-y-4 py-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pedir</h1>
        <p className="text-sm text-muted-foreground">
          Marca lo que falta. Se guarda solo, sin botón de guardar.
        </p>
      </header>

      {!esBarista ? (
        <SelectorLocal locales={localesDisponibles} actual={localId} basePath="/pedir" />
      ) : null}

      {items.length === 0 ? (
        <EstadoVacio
          titulo="Este local no tiene productos asignados"
          descripcion="El operador tiene que asignar productos a este local desde administración para que aparezcan aquí."
        />
      ) : (
        <ListaPedir
          items={items}
          localId={localId}
          localNombre={local?.name ?? 'tu local'}
        />
      )}
    </div>
  )
}
