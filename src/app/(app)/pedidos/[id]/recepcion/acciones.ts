'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { TipoIncidencia } from '@/lib/database.types'

export type LineaRecepcion = {
  productId: string
  qtyReceived: number
  unitPriceActual: number | null
  incidence: TipoIncidencia
  note: string | null
}

export type Resultado = { ok: true; receiptId: string } | { ok: false; mensaje: string }

/**
 * Guarda (o retoma) una recepción.
 *
 * Reutiliza la recepción abierta que ya exista para ese pedido y ese local en
 * vez de crear una nueva: "recepción a medias que se puede retomar después" es
 * un criterio explícito de MISE-005, y con dos recepciones abiertas las
 * cantidades se contarían dos veces.
 *
 * No toca el estado del pedido ni escribe en price_history: de eso se encargan
 * los triggers. Aquí solo se registra lo que se ha visto en la puerta.
 */
export async function guardarRecepcion(
  orderId: string,
  locationId: string,
  docRef: string | null,
  cerrar: boolean,
  lineas: LineaRecepcion[],
): Promise<Resultado> {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, mensaje: 'Se ha cerrado la sesión. Vuelve a entrar.' }

  const { data: abierta } = await supabase
    .from('receipts')
    .select('id')
    .eq('order_id', orderId)
    .eq('location_id', locationId)
    .eq('closed', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let receiptId = abierta?.id ?? null

  if (!receiptId) {
    const { data: creada, error } = await supabase
      .from('receipts')
      .insert({
        order_id: orderId,
        location_id: locationId,
        received_by: user.id,
        doc_ref: docRef,
        closed: false,
      })
      .select('id')
      .single()

    if (error || !creada) {
      return {
        ok: false,
        mensaje: error?.message ?? 'No se ha podido abrir la recepción.',
      }
    }
    receiptId = creada.id
  } else if (docRef !== null) {
    await supabase.from('receipts').update({ doc_ref: docRef }).eq('id', receiptId)
  }

  // Upsert por (receipt_id, product_id): reabrir la pantalla y corregir un
  // número no duplica la línea.
  const { error: errorLineas } = await supabase.from('receipt_lines').upsert(
    lineas.map((l) => ({
      receipt_id: receiptId as string,
      product_id: l.productId,
      qty_received: l.qtyReceived,
      unit_price_actual: l.unitPriceActual,
      incidence: l.incidence,
      note: l.note,
    })),
    { onConflict: 'receipt_id,product_id' },
  )

  if (errorLineas) {
    return { ok: false, mensaje: errorLineas.message }
  }

  // El cierre va al final: es lo que dispara el recálculo de estado del pedido
  // con todas las líneas ya escritas.
  if (cerrar) {
    const { error } = await supabase
      .from('receipts')
      .update({ closed: true })
      .eq('id', receiptId)

    if (error) return { ok: false, mensaje: error.message }
  }

  revalidatePath(`/pedidos/${orderId}`)
  revalidatePath(`/pedidos/${orderId}/recepcion`)
  revalidatePath('/pedidos')
  revalidatePath('/panel')

  return { ok: true, receiptId }
}

/** Camino de un toque: todo llegó como se pidió (MISE-005, < 20 segundos). */
export async function recibirTodoCorrecto(
  orderId: string,
  locationId: string,
  docRef: string | null,
): Promise<Resultado> {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('receive_order_complete', {
    p_order_id: orderId,
    p_location_id: locationId,
    p_doc_ref: docRef,
  })

  if (error || !data) {
    return {
      ok: false,
      mensaje: error?.message ?? 'No se ha podido registrar la recepción.',
    }
  }

  revalidatePath(`/pedidos/${orderId}`)
  revalidatePath(`/pedidos/${orderId}/recepcion`)
  revalidatePath('/pedidos')
  revalidatePath('/panel')

  return { ok: true, receiptId: data }
}
