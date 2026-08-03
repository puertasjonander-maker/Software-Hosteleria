'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { CanalContacto } from '@/lib/database.types'

/**
 * Acciones de servidor del bloque "Pedir".
 *
 * Van por el cliente de servidor con la cookie del usuario, así que la RLS se
 * sigue aplicando igual que si la llamada viniera del navegador. Estar en el
 * servidor no da privilegios: para eso está `lib/supabase/admin.ts`, que aquí
 * no se toca.
 */

export type Resultado = { ok: true } | { ok: false; mensaje: string }

/** Convierte el error de Postgres en algo que se pueda leer en una pantalla. */
function comoResultado(error: { message: string } | null): Resultado {
  if (!error) return { ok: true }
  // Las excepciones que lanzamos a propósito en las RPC ya vienen en español.
  const limpio = error.message.replace(/^.*?:\s*/, '').trim()
  return { ok: false, mensaje: limpio || 'No se ha podido completar la operación.' }
}

export async function prepararPedido(supplierId: string): Promise<void> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('build_draft_order', {
    p_supplier_id: supplierId,
  })

  if (error || !data) {
    throw new Error(error?.message ?? 'No se ha podido preparar el pedido')
  }

  revalidatePath('/pedidos')
  redirect(`/pedidos/${data}`)
}

export async function actualizarCantidadLinea(
  lineId: string,
  qty: number,
  orderId: string,
): Promise<Resultado> {
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, mensaje: 'La cantidad tiene que ser mayor que cero.' }
  }

  const supabase = createClient()
  const { error } = await supabase
    .from('order_lines')
    .update({ qty_total: qty })
    .eq('id', lineId)

  revalidatePath(`/pedidos/${orderId}`)
  return comoResultado(error)
}

export async function excluirLinea(lineId: string, orderId: string): Promise<Resultado> {
  const supabase = createClient()
  const { error } = await supabase.rpc('exclude_order_line', { p_line_id: lineId })

  revalidatePath(`/pedidos/${orderId}`)
  revalidatePath('/pedidos')
  return comoResultado(error)
}

/**
 * Añade una línea que nadie solicitó. Es el caso de "ya que pedimos, mete dos
 * cajas de leche": no nace de una solicitud, así que no lleva desglose por local.
 */
export async function anadirLinea(
  orderId: string,
  productId: string,
  qty: number,
): Promise<Resultado> {
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, mensaje: 'Indica una cantidad mayor que cero.' }
  }

  const supabase = createClient()

  const { data: producto } = await supabase
    .from('products')
    .select('last_known_price')
    .eq('id', productId)
    .maybeSingle()

  const { error } = await supabase.from('order_lines').insert({
    order_id: orderId,
    product_id: productId,
    qty_total: qty,
    qty_by_location: {},
    unit_price_expected: producto?.last_known_price ?? null,
  })

  if (error?.code === '23505') {
    return {
      ok: false,
      mensaje: 'Ese producto ya está en el pedido. Ajusta la cantidad en su línea.',
    }
  }

  revalidatePath(`/pedidos/${orderId}`)
  return comoResultado(error)
}

export async function marcarEnviado(
  orderId: string,
  mensaje: string,
  canal: CanalContacto,
  entregaPrevista: string | null,
): Promise<Resultado> {
  const supabase = createClient()
  const { error } = await supabase.rpc('send_order', {
    p_order_id: orderId,
    p_message: mensaje,
    p_channel: canal,
    p_expected_delivery: entregaPrevista,
  })

  revalidatePath(`/pedidos/${orderId}`)
  revalidatePath('/pedidos')
  return comoResultado(error)
}

export async function crearComplementario(orderId: string): Promise<void> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('create_complement_order', {
    p_order_id: orderId,
  })

  if (error || !data) {
    throw new Error(error?.message ?? 'No se ha podido crear el pedido complementario')
  }

  revalidatePath('/pedidos')
  redirect(`/pedidos/${data}`)
}

/** Descartar un borrador devuelve sus solicitudes a la bandeja, no las borra. */
export async function descartarBorrador(orderId: string): Promise<void> {
  const supabase = createClient()

  await supabase.from('requests').update({ order_id: null }).eq('order_id', orderId)
  await supabase.from('orders').delete().eq('id', orderId)

  revalidatePath('/pedidos')
  redirect('/pedidos')
}
