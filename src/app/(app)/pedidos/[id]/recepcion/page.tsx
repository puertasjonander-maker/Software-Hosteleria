import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { exigirSesion } from '@/lib/auth'
import { fecha } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { EstadoError, EstadoVacio } from '@/components/ui/states'
import { SelectorLocal } from '@/components/selector-local'
import { FormularioRecepcion, type LineaRecepcionVista } from './formulario-recepcion'

export const metadata: Metadata = { title: 'Recepción' }
export const dynamic = 'force-dynamic'

/** Umbral por defecto si el operador aún no ha configurado el suyo (MISE-006). */
const UMBRAL_POR_DEFECTO = 5

export default async function PaginaRecepcion({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { local?: string }
}) {
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
        <EstadoError descripcion="No hemos podido cargar el pedido." />
      </div>
    )
  }
  if (!pedido) notFound()

  if (pedido.status === 'borrador') {
    return (
      <div className="container max-w-3xl space-y-4 py-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/pedidos/${pedido.id}`}>
            <ArrowLeft /> Volver al pedido
          </Link>
        </Button>
        <EstadoVacio
          titulo="Este pedido todavía no se ha enviado"
          descripcion="No se puede recepcionar lo que aún no ha salido. Márcalo como enviado primero."
        />
      </div>
    )
  }

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

  if (!localId) {
    return (
      <div className="container max-w-3xl py-6">
        <EstadoVacio
          titulo="Falta saber en qué local se recibe"
          descripcion="Tu usuario no tiene local asignado. Pídeselo al operador."
        />
      </div>
    )
  }

  if (!esBarista && !searchParams.local && localesDisponibles.length > 1) {
    redirect(`/pedidos/${params.id}/recepcion?local=${localesDisponibles[0].id}`)
  }

  const [proveedor, lineas, recepciones, ajustes] = await Promise.all([
    supabase.from('suppliers').select('name').eq('id', pedido.supplier_id).maybeSingle(),
    supabase.from('order_lines').select('*').eq('order_id', pedido.id),
    supabase.from('receipts').select('*').eq('order_id', pedido.id),
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'price_deviation_threshold_pct')
      .maybeSingle(),
  ])

  const idsProducto = (lineas.data ?? []).map((l) => l.product_id)

  const [productos, precios, lineasPrevias] = await Promise.all([
    idsProducto.length
      ? supabase.from('products').select('*').in('id', idsProducto)
      : Promise.resolve({ data: [] as never[] }),
    idsProducto.length
      ? supabase.from('product_current_price').select('*').in('product_id', idsProducto)
      : Promise.resolve({ data: [] as never[] }),
    (recepciones.data ?? []).length
      ? supabase
          .from('receipt_lines')
          .select('*')
          .in(
            'receipt_id',
            (recepciones.data ?? []).map((r) => r.id),
          )
      : Promise.resolve({ data: [] as never[] }),
  ])

  const porProducto = new Map((productos.data ?? []).map((p) => [p.id, p]))
  const precioPorProducto = new Map((precios.data ?? []).map((p) => [p.product_id, p]))

  // La recepción abierta de ESTE local es la que se retoma; las cerradas y las
  // de otros locales solo cuentan para saber qué queda por recibir.
  const recepcionAbierta = (recepciones.data ?? []).find(
    (r) => r.location_id === localId && !r.closed,
  )
  const idsRecepcionesLocal = new Set(
    (recepciones.data ?? []).filter((r) => r.location_id === localId).map((r) => r.id),
  )

  const previasDeEsteLocal = (lineasPrevias.data ?? []).filter((l) =>
    idsRecepcionesLocal.has(l.receipt_id),
  )
  const enCurso = new Map(
    (lineasPrevias.data ?? [])
      .filter((l) => recepcionAbierta && l.receipt_id === recepcionAbierta.id)
      .map((l) => [l.product_id, l]),
  )
  const yaCerrado = new Map<string, number>()
  for (const l of previasDeEsteLocal) {
    if (recepcionAbierta && l.receipt_id === recepcionAbierta.id) continue
    yaCerrado.set(l.product_id, (yaCerrado.get(l.product_id) ?? 0) + Number(l.qty_received))
  }

  const items: LineaRecepcionVista[] = (lineas.data ?? [])
    .map((linea) => {
      const producto = porProducto.get(linea.product_id)
      const desglose = linea.qty_by_location ?? {}
      const tieneDesglose = Object.keys(desglose).length > 0
      const esperadoAqui = tieneDesglose
        ? Number(desglose[localId] ?? 0)
        : Number(linea.qty_total)

      const precio = precioPorProducto.get(linea.product_id)
      const previa = enCurso.get(linea.product_id)

      return {
        productId: linea.product_id,
        productName: producto?.name ?? 'Producto',
        orderUnit: producto?.order_unit ?? '',
        esperado: esperadoAqui,
        yaRecibido: yaCerrado.get(linea.product_id) ?? 0,
        precioAnterior:
          precio?.price_per_order_unit === null || precio?.price_per_order_unit === undefined
            ? null
            : Number(precio.price_per_order_unit),
        precioAnteriorTipo: precio?.price_kind ?? 'sin_dato',
        precioAnteriorFecha: precio?.price_date ?? null,
        // Si hay una recepción a medias, se retoma tal cual se dejó.
        qtyInicial: previa ? Number(previa.qty_received) : esperadoAqui,
        precioInicial:
          previa?.unit_price_actual === null || previa?.unit_price_actual === undefined
            ? null
            : Number(previa.unit_price_actual),
        incidenciaInicial: previa?.incidence ?? 'ninguna',
        notaInicial: previa?.note ?? null,
      }
    })
    // Si un pedido no trae nada para este local, no se enseña ni se puede tocar.
    .filter((i) => i.esperado > 0)

  const umbral = Number(ajustes.data?.value ?? UMBRAL_POR_DEFECTO) || UMBRAL_POR_DEFECTO

  return (
    <div className="container max-w-3xl space-y-5 py-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/pedidos/${pedido.id}`}>
          <ArrowLeft /> Volver al pedido
        </Link>
      </Button>

      <header className="space-y-1">
        <h1 className="titulo-pantalla">
          Recibir de {proveedor.data?.name ?? 'proveedor'}
        </h1>
        <p className="text-sm text-muted-foreground">
          Pedido del {fecha(pedido.order_date)}
          {pedido.expected_delivery
            ? ` · entrega prevista ${fecha(pedido.expected_delivery)}`
            : ''}
        </p>
      </header>

      {!esBarista ? (
        <SelectorLocal
          locales={localesDisponibles}
          actual={localId}
          basePath={`/pedidos/${pedido.id}/recepcion`}
        />
      ) : null}

      {items.length === 0 ? (
        <EstadoVacio
          titulo="Este pedido no trae nada para este local"
          descripcion="Cambia de local o comprueba el desglose del pedido."
        />
      ) : (
        <FormularioRecepcion
          orderId={pedido.id}
          locationId={localId}
          items={items}
          docRefInicial={recepcionAbierta?.doc_ref ?? ''}
          hayRecepcionAbierta={Boolean(recepcionAbierta)}
          umbralDesviacion={umbral}
        />
      )}
    </div>
  )
}
