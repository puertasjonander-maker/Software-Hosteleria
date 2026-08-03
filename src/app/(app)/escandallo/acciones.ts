'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { EstadoMapeo } from '@/lib/database.types'
import { SIMILITUD_AMBIGUA, SIMILITUD_AUTOMATICA, type FilaEscandallo } from '@/lib/escandallo'

export type ResumenImportacion = {
  ok: boolean
  mensaje?: string
  elaboraciones: number
  lineas: number
  mapeadasAuto: number
  ambiguas: number
  sinMapear: number
}

/**
 * Importa el escandallo (MISE-008).
 *
 * Tres reglas que no se negocian:
 *  · El nombre original del Excel se guarda siempre en `raw_ingredient_name`,
 *    aunque la línea acabe apuntando a un producto del catálogo.
 *  · Una elaboración con líneas sin mapear se importa igual, marcada, y nunca
 *    se descarta.
 *  · El emparejado automático propone; no decide. Por encima de 0,55 de
 *    similitud se acepta, entre 0,3 y 0,55 queda 'ambiguo' para que una persona
 *    lo mire, y por debajo 'sin_mapear'.
 */
export async function importarEscandallo(
  filas: FilaEscandallo[],
): Promise<ResumenImportacion> {
  const supabase = createClient()

  const vacio: ResumenImportacion = {
    ok: false,
    elaboraciones: 0,
    lineas: 0,
    mapeadasAuto: 0,
    ambiguas: 0,
    sinMapear: 0,
  }

  if (filas.length === 0) {
    return { ...vacio, mensaje: 'No hay filas que importar.' }
  }

  // Un solo emparejado por nombre distinto, no uno por fila: un escandallo
  // repite "Leche entera" veinte veces.
  const nombresUnicos = [...new Set(filas.map((f) => f.ingrediente))]
  const emparejado = new Map<string, { productId: string | null; estado: EstadoMapeo }>()

  for (const nombre of nombresUnicos) {
    const { data } = await supabase.rpc('match_ingredient', { p_name: nombre, p_limit: 1 })
    const mejor = data?.[0]

    if (mejor && mejor.score >= SIMILITUD_AUTOMATICA) {
      emparejado.set(nombre, { productId: mejor.product_id, estado: 'mapeado' })
    } else if (mejor && mejor.score >= SIMILITUD_AMBIGUA) {
      emparejado.set(nombre, { productId: null, estado: 'ambiguo' })
    } else {
      emparejado.set(nombre, { productId: null, estado: 'sin_mapear' })
    }
  }

  const porElaboracion = new Map<string, FilaEscandallo[]>()
  for (const fila of filas) {
    const lista = porElaboracion.get(fila.elaboracion) ?? []
    lista.push(fila)
    porElaboracion.set(fila.elaboracion, lista)
  }

  let lineasCreadas = 0
  const conteo = { mapeado: 0, ambiguo: 0, sin_mapear: 0 }

  for (const [nombre, lineas] of porElaboracion) {
    const cabecera = lineas[0]

    const { data: existente } = await supabase
      .from('recipes')
      .select('id')
      .ilike('name', nombre)
      .maybeSingle()

    let recipeId = existente?.id ?? null

    if (recipeId) {
      await supabase
        .from('recipes')
        .update({
          yield_qty: cabecera.raciones,
          yield_unit: cabecera.unidadRacion,
          ...(cabecera.pvp !== null
            ? { current_price: cabecera.pvp, price_set_at: new Date().toISOString() }
            : {}),
        })
        .eq('id', recipeId)

      // Reimportar sustituye las líneas: el Excel sigue siendo la fuente de
      // verdad de la receta, y mezclar dos versiones daría un coste falso.
      await supabase.from('recipe_lines').delete().eq('recipe_id', recipeId)
    } else {
      const { data: creada, error } = await supabase
        .from('recipes')
        .insert({
          name: nombre,
          yield_qty: cabecera.raciones,
          yield_unit: cabecera.unidadRacion,
          current_price: cabecera.pvp,
          price_set_at: cabecera.pvp !== null ? new Date().toISOString() : null,
          source: 'importado',
        })
        .select('id')
        .single()

      if (error || !creada) {
        return {
          ...vacio,
          mensaje: `No se ha podido crear la elaboración "${nombre}": ${error?.message ?? ''}`,
        }
      }
      recipeId = creada.id
    }

    const aInsertar = lineas.map((linea) => {
      const match = emparejado.get(linea.ingrediente) ?? {
        productId: null,
        estado: 'sin_mapear' as EstadoMapeo,
      }
      conteo[match.estado] += 1

      return {
        recipe_id: recipeId as string,
        product_id: match.productId,
        raw_ingredient_name: linea.ingrediente,
        qty: linea.cantidad,
        unit: linea.unidad,
        waste_pct: linea.mermaPct,
        mapping_status: match.estado,
      }
    })

    const { error } = await supabase.from('recipe_lines').insert(aInsertar)
    if (error) {
      return {
        ...vacio,
        mensaje: `Error al importar "${nombre}": ${error.message}`,
      }
    }
    lineasCreadas += aInsertar.length
  }

  revalidatePath('/escandallo')
  revalidatePath('/panel')

  return {
    ok: true,
    elaboraciones: porElaboracion.size,
    lineas: lineasCreadas,
    mapeadasAuto: conteo.mapeado,
    ambiguas: conteo.ambiguo,
    sinMapear: conteo.sin_mapear,
  }
}

export type Resultado = { ok: true } | { ok: false; mensaje: string }

/** Asigna un producto del catálogo a una línea sin mapear. */
export async function mapearLinea(lineId: string, productId: string): Promise<Resultado> {
  const supabase = createClient()

  const { error } = await supabase
    .from('recipe_lines')
    .update({ product_id: productId, mapping_status: 'mapeado' })
    .eq('id', lineId)

  revalidatePath('/escandallo')
  revalidatePath('/escandallo/mapeo')

  return error ? { ok: false, mensaje: error.message } : { ok: true }
}

export async function desmapearLinea(lineId: string): Promise<Resultado> {
  const supabase = createClient()

  const { error } = await supabase
    .from('recipe_lines')
    .update({ product_id: null, mapping_status: 'sin_mapear' })
    .eq('id', lineId)

  revalidatePath('/escandallo')
  revalidatePath('/escandallo/mapeo')

  return error ? { ok: false, mensaje: error.message } : { ok: true }
}

/**
 * Crea el producto que falta y mapea la línea de golpe. Es el caso de un
 * ingrediente que existe en la cocina pero no en el catálogo de compras.
 */
export async function crearProductoYMapear(
  lineId: string,
  datos: {
    supplierId: string
    name: string
    category: string
    orderUnit: string
    baseUnit: 'kg' | 'l' | 'ud'
    unitsPerOrderUnit: number
    lastKnownPrice: number | null
  },
): Promise<Resultado> {
  const supabase = createClient()

  const { data: producto, error } = await supabase
    .from('products')
    .insert({
      supplier_id: datos.supplierId,
      name: datos.name,
      category: datos.category,
      order_unit: datos.orderUnit,
      base_unit: datos.baseUnit,
      units_per_order_unit: datos.unitsPerOrderUnit,
      last_known_price: datos.lastKnownPrice,
    })
    .select('id')
    .single()

  if (error || !producto) {
    return { ok: false, mensaje: error?.message ?? 'No se ha podido crear el producto.' }
  }

  // El precio del Excel entra como 'manual', es decir, estimado. Nunca 'real':
  // solo una recepción produce un precio real (CONTEXT.md §7).
  if (datos.lastKnownPrice !== null) {
    await supabase.from('price_history').insert({
      product_id: producto.id,
      price: datos.lastKnownPrice,
      source: 'manual',
    })
  }

  return mapearLinea(lineId, producto.id)
}

/** Fija el PVP actual de una elaboración (MISE-009). Mise no es un TPV. */
export async function fijarPvp(recipeId: string, pvp: number | null): Promise<Resultado> {
  const supabase = createClient()

  const { error } = await supabase
    .from('recipes')
    .update({
      current_price: pvp,
      price_set_at: pvp === null ? null : new Date().toISOString(),
    })
    .eq('id', recipeId)

  revalidatePath('/escandallo')
  revalidatePath(`/escandallo/${recipeId}`)

  return error ? { ok: false, mensaje: error.message } : { ok: true }
}
