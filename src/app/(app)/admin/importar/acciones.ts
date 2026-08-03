'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { FilaCatalogo } from '@/lib/catalogo'

export type ResumenCatalogo = {
  ok: boolean
  mensaje?: string
  proveedores: number
  productos: number
  pautas: number
  asignaciones: number
  localesDesconocidos: string[]
}

/**
 * Importa el catálogo completo (MISE-000).
 *
 * Idempotente por diseño: reimportar el mismo fichero actualiza en vez de
 * duplicar. El operador va a corregir el CSV y volver a subirlo tres veces antes
 * de que quede bien, y esa es la forma normal de usarlo, no un abuso.
 *
 * Lo que NO hace: crear locales. Un nombre de local mal escrito en el CSV
 * generaría un cuarto local fantasma con dos productos dentro, así que se
 * reporta como aviso y se deja que lo arregle una persona.
 */
export async function importarCatalogo(filas: FilaCatalogo[]): Promise<ResumenCatalogo> {
  const supabase = createClient()

  const vacio: ResumenCatalogo = {
    ok: false,
    proveedores: 0,
    productos: 0,
    pautas: 0,
    asignaciones: 0,
    localesDesconocidos: [],
  }

  if (filas.length === 0) {
    return { ...vacio, mensaje: 'No hay filas que importar.' }
  }

  const { data: locales } = await supabase.from('locations').select('id, name').eq('active', true)
  const idPorLocal = new Map(
    (locales ?? []).map((l) => [l.name.trim().toLowerCase(), l.id] as const),
  )

  if (idPorLocal.size === 0) {
    return {
      ...vacio,
      mensaje: 'No hay ningún local activo. Créalos antes de importar el catálogo.',
    }
  }

  // ── Proveedores ────────────────────────────────────────────────────────────
  const proveedoresUnicos = new Map<string, FilaCatalogo>()
  for (const fila of filas) {
    if (!proveedoresUnicos.has(fila.proveedor.toLowerCase())) {
      proveedoresUnicos.set(fila.proveedor.toLowerCase(), fila)
    }
  }

  const { data: existentes } = await supabase.from('suppliers').select('id, name')
  const idPorProveedor = new Map(
    (existentes ?? []).map((s) => [s.name.trim().toLowerCase(), s.id] as const),
  )

  let proveedoresCreados = 0
  for (const [clave, fila] of proveedoresUnicos) {
    const existente = idPorProveedor.get(clave)

    if (existente) {
      await supabase
        .from('suppliers')
        .update({ contact_channel: fila.canal, contact_value: fila.contacto })
        .eq('id', existente)
      continue
    }

    const { data: creado, error } = await supabase
      .from('suppliers')
      .insert({
        name: fila.proveedor,
        contact_channel: fila.canal,
        contact_value: fila.contacto,
      })
      .select('id')
      .single()

    if (error || !creado) {
      return { ...vacio, mensaje: `No se ha podido crear "${fila.proveedor}": ${error?.message}` }
    }

    idPorProveedor.set(clave, creado.id)
    proveedoresCreados += 1
  }

  // ── Pautas ─────────────────────────────────────────────────────────────────
  // Un proveedor puede aparecer en varias filas con distintos días de pedido;
  // se recogen todos y se deduplica por (proveedor, día).
  const pautas = new Map<string, { supplierId: string; fila: FilaCatalogo }>()
  for (const fila of filas) {
    if (fila.diaPedido === null || fila.horaCorte === null) continue
    const supplierId = idPorProveedor.get(fila.proveedor.toLowerCase())
    if (!supplierId) continue
    pautas.set(`${supplierId}::${fila.diaPedido}`, { supplierId, fila })
  }

  let pautasEscritas = 0
  for (const { supplierId, fila } of pautas.values()) {
    const { error } = await supabase.from('supplier_schedules').upsert(
      {
        supplier_id: supplierId,
        order_weekday: fila.diaPedido as number,
        cutoff_time: fila.horaCorte as string,
        delivery_weekday: fila.diaEntrega,
        lead_time_days: fila.plazoDias,
      },
      { onConflict: 'supplier_id,order_weekday' },
    )
    if (!error) pautasEscritas += 1
  }

  // ── Productos y asignación a locales ───────────────────────────────────────
  const productosUnicos = new Map<string, FilaCatalogo>()
  for (const fila of filas) {
    // Misma clave que el índice único del esquema: proveedor + nombre.
    productosUnicos.set(`${fila.proveedor.toLowerCase()}::${fila.producto.toLowerCase()}`, fila)
  }

  let productosEscritos = 0
  let asignaciones = 0
  const localesDesconocidos = new Set<string>()

  for (const fila of productosUnicos.values()) {
    const supplierId = idPorProveedor.get(fila.proveedor.toLowerCase())
    if (!supplierId) continue

    const { data: existente } = await supabase
      .from('products')
      .select('id')
      .eq('supplier_id', supplierId)
      .ilike('name', fila.producto)
      .maybeSingle()

    const datos = {
      supplier_id: supplierId,
      name: fila.producto,
      category: fila.categoria,
      order_unit: fila.unidadPedido,
      base_unit: fila.unidadBase,
      units_per_order_unit: fila.unidadesPorPedido,
      last_known_price: fila.ultimoPrecio,
      active: true,
    }

    let productId = existente?.id ?? null

    if (productId) {
      await supabase.from('products').update(datos).eq('id', productId)
    } else {
      const { data: creado, error } = await supabase
        .from('products')
        .insert(datos)
        .select('id')
        .single()

      if (error || !creado) {
        return {
          ...vacio,
          mensaje: `No se ha podido crear "${fila.producto}": ${error?.message}`,
        }
      }
      productId = creado.id
    }
    productosEscritos += 1

    // El precio del CSV es del Excel: entra como 'manual', o sea, estimado.
    if (fila.ultimoPrecio !== null) {
      await supabase
        .from('price_history')
        .insert({ product_id: productId, price: fila.ultimoPrecio, source: 'manual' })
    }

    const destinos =
      fila.locales === null
        ? [...idPorLocal.values()]
        : fila.locales
            .map((nombre) => {
              const id = idPorLocal.get(nombre.toLowerCase())
              if (!id) localesDesconocidos.add(nombre)
              return id
            })
            .filter((id): id is string => Boolean(id))

    if (destinos.length > 0) {
      const { error } = await supabase.from('location_products').upsert(
        destinos.map((location_id) => ({
          location_id,
          product_id: productId as string,
          active: true,
        })),
        { onConflict: 'location_id,product_id' },
      )
      if (!error) asignaciones += destinos.length
    }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/productos')
  revalidatePath('/admin/proveedores')
  revalidatePath('/pedir')

  return {
    ok: true,
    proveedores: proveedoresCreados,
    productos: productosEscritos,
    pautas: pautasEscritas,
    asignaciones,
    localesDesconocidos: [...localesDesconocidos],
  }
}
