import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, PackageOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { exigirSesion } from '@/lib/auth'
import { esGestor } from '@/lib/roles'
import { calcularCorte } from '@/lib/cutoff'
import { hoyEnMadrid } from '@/lib/time'
import { Button } from '@/components/ui/button'
import { EstadoError } from '@/components/ui/states'
import { DetallePedido, type LineaDetalle } from './detalle-pedido'
import { PedidoEnviado } from './pedido-enviado'

export const metadata: Metadata = { title: 'Pedido' }
export const dynamic = 'force-dynamic'

export default async function PaginaPedido({ params }: { params: { id: string } }) {
  const sesion = await exigirSesion()
  const supabase = createClient()

  const { data: pedido, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (error) {
    return (
      <div className="container max-w-3xl py-6">
        <EstadoError descripcion="No hemos podido cargar este pedido." />
      </div>
    )
  }
  if (!pedido) notFound()

  const [proveedor, lineas, locales, pautas] = await Promise.all([
    supabase.from('suppliers').select('*').eq('id', pedido.supplier_id).maybeSingle(),
    supabase.from('order_lines').select('*').eq('order_id', pedido.id),
    supabase.from('locations').select('*').eq('active', true).order('name'),
    supabase.from('supplier_schedules').select('*').eq('supplier_id', pedido.supplier_id),
  ])

  const idsProducto = (lineas.data ?? []).map((l) => l.product_id)

  const [productos, solicitudes, catalogo] = await Promise.all([
    idsProducto.length
      ? supabase.from('products').select('*').in('id', idsProducto)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from('requests')
      .select('id, product_id, location_id, qty, note, requested_by, created_at')
      .eq('order_id', pedido.id),
    // Para "añadir línea no solicitada": el resto del catálogo de este proveedor.
    supabase
      .from('products')
      .select('id, name, order_unit, category, last_known_price')
      .eq('supplier_id', pedido.supplier_id)
      .eq('active', true)
      .order('name'),
  ])

  // Quien envió el pedido va en la misma consulta que los solicitantes: el pie
  // de la pantalla de "enviado" tiene que poder poner su nombre.
  const idsPerfil = [
    ...new Set(
      [...(solicitudes.data ?? []).map((r) => r.requested_by), pedido.sent_by].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ]
  const { data: perfiles } = idsPerfil.length
    ? await supabase.from('profiles').select('id, full_name').in('id', idsPerfil)
    : { data: [] }

  const nombrePerfil = new Map((perfiles ?? []).map((p) => [p.id, p.full_name]))
  const nombreLocal = new Map((locales.data ?? []).map((l) => [l.id, l.name]))
  const porProducto = new Map((productos.data ?? []).map((p) => [p.id, p]))

  const detalle: LineaDetalle[] = (lineas.data ?? [])
    .map((linea) => {
      const producto = porProducto.get(linea.product_id)
      const desglose = Object.entries(linea.qty_by_location ?? {}).map(
        ([locationId, qty]) => ({
          locationId,
          locationName: nombreLocal.get(locationId) ?? 'Local',
          qty: Number(qty),
        }),
      )

      const solicitantes = (solicitudes.data ?? [])
        .filter((r) => r.product_id === linea.product_id)
        .map((r) => ({
          nombre: nombrePerfil.get(r.requested_by) || 'Sin nombre',
          localNombre: nombreLocal.get(r.location_id) ?? 'Local',
          qty: Number(r.qty),
          cuando: r.created_at,
          nota: r.note,
        }))

      return {
        id: linea.id,
        productId: linea.product_id,
        productName: producto?.name ?? 'Producto no disponible',
        orderUnit: producto?.order_unit ?? '',
        category: producto?.category ?? '',
        qtyTotal: Number(linea.qty_total),
        unitPriceExpected:
          linea.unit_price_expected === null ? null : Number(linea.unit_price_expected),
        desglose: desglose.sort((a, b) => a.locationName.localeCompare(b.locationName, 'es')),
        solicitantes,
      }
    })
    .sort((a, b) => a.productName.localeCompare(b.productName, 'es'))

  const corte = calcularCorte(pautas.data ?? [])
  const gestor = esGestor(sesion.profile.role)

  const entregaSugerida =
    pedido.expected_delivery ??
    (corte.entregaEstimada ? hoyEnMadrid(corte.entregaEstimada) : null)

  const yaEnPedido = new Set(idsProducto)
  const catalogoDisponible = (catalogo.data ?? [])
    .filter((p) => !yaEnPedido.has(p.id))
    .map((p) => ({
      id: p.id,
      nombre: p.name,
      unidadPedido: p.order_unit,
      categoria: p.category,
    }))

  return (
    <div className="container max-w-3xl space-y-6 py-4">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/pedidos">
            <ArrowLeft /> Pedidos
          </Link>
        </Button>

        {pedido.status !== 'borrador' ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/pedidos/${pedido.id}/recepcion`}>
              <PackageOpen /> Recepción
            </Link>
          </Button>
        ) : null}
      </div>

      {pedido.status === 'borrador' ? (
        <DetallePedido
          pedido={{
            id: pedido.id,
            status: pedido.status,
            channel: pedido.channel,
            orderDate: pedido.order_date,
            expectedDelivery: entregaSugerida,
            supersedesId: pedido.supersedes_id,
          }}
          proveedor={{
            id: pedido.supplier_id,
            nombre: proveedor.data?.name ?? 'Proveedor',
            canal: proveedor.data?.contact_channel ?? 'whatsapp',
            contacto: proveedor.data?.contact_value ?? '',
          }}
          lineas={detalle}
          catalogo={catalogoDisponible}
          locales={(locales.data ?? []).map((l) => ({ id: l.id, nombre: l.name }))}
          corte={{ estado: corte.estado, etiqueta: corte.etiqueta, minutosHasta: corte.minutosHasta }}
          puedeEditar={gestor}
          nombreUsuario={sesion.profile.full_name || sesion.email || ''}
        />
      ) : (
        <PedidoEnviado
          pedido={{
            id: pedido.id,
            status: pedido.status,
            channel: pedido.channel,
            sentAt: pedido.sent_at,
            expectedDelivery: pedido.expected_delivery,
            snapshot: pedido.message_snapshot,
            supersedesId: pedido.supersedes_id,
          }}
          proveedorNombre={proveedor.data?.name ?? 'Proveedor'}
          enviadoPor={
            pedido.sent_by ? (nombrePerfil.get(pedido.sent_by) ?? null) : null
          }
          lineas={detalle}
          puedeGestionar={gestor}
        />
      )}
    </div>
  )
}
