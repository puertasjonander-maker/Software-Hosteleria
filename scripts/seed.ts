/**
 * Carga de datos de arranque.
 *
 *   npm run db:seed              → catálogo DEMO
 *   npm run db:seed -- --real ruta/al/catalogo.csv
 *
 * Regla 1 del BUILD_SPEC: el catálogo no se inventa. Este script carga por
 * defecto `seed/catalogo.demo.csv`, cuyos proveedores llevan el prefijo
 * "DEMO ·" para que nunca se confundan con los reales, y se niega a mezclar
 * datos DEMO con una base que ya tenga catálogo real.
 *
 * Usa la service role key porque crea locales y usuarios, que es justo lo que la
 * RLS impide hacer sin sesión.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import Papa from 'papaparse'
import { interpretarCatalogo, type FilaCatalogo } from '../src/lib/catalogo'
import type { Database } from '../src/lib/database.types'

const LOCALES_DEMO = ['Local Centro', 'Local Teatinos', 'Local Puerto']

function entorno(clave: string): string {
  const valor = process.env[clave]
  if (!valor) {
    console.error(`Falta ${clave}. Copia .env.example a .env.local y rellénalo.`)
    process.exit(1)
  }
  return valor
}

function leerCsv(ruta: string): Record<string, unknown>[] {
  if (!existsSync(ruta)) {
    console.error(`No existe el fichero ${ruta}`)
    process.exit(1)
  }

  const { data, errors } = Papa.parse<Record<string, unknown>>(readFileSync(ruta, 'utf8'), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  if (errors.length > 0) {
    console.error('El CSV tiene errores de formato:')
    for (const e of errors.slice(0, 5)) console.error(`  fila ${e.row}: ${e.message}`)
    process.exit(1)
  }

  return data
}

async function main() {
  const argumentos = process.argv.slice(2)
  const indiceReal = argumentos.indexOf('--real')
  const esReal = indiceReal !== -1
  const ruta = esReal
    ? resolve(argumentos[indiceReal + 1] ?? '')
    : resolve(process.cwd(), 'seed/catalogo.demo.csv')

  if (esReal && !argumentos[indiceReal + 1]) {
    console.error('Uso: npm run db:seed -- --real ruta/al/catalogo.csv')
    process.exit(1)
  }

  const supabase = createClient<Database>(
    entorno('NEXT_PUBLIC_SUPABASE_URL'),
    entorno('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )

  // ── Salvaguarda: no mezclar DEMO con datos reales ─────────────────────────
  const { data: proveedoresExistentes } = await supabase.from('suppliers').select('id, name')
  const hayReales = (proveedoresExistentes ?? []).some((s) => !s.name.startsWith('DEMO ·'))

  if (!esReal && hayReales) {
    console.error(
      'La base ya tiene proveedores reales. El seed DEMO no se carga encima de datos\n' +
        'de verdad. Si quieres cargar el catálogo real, usa:\n' +
        '  npm run db:seed -- --real ruta/al/catalogo.csv',
    )
    process.exit(1)
  }

  console.log(esReal ? `Cargando catálogo REAL desde ${ruta}` : 'Cargando catálogo DEMO')

  // ── Locales ───────────────────────────────────────────────────────────────
  const { data: locales } = await supabase.from('locations').select('id, name')
  const idPorLocal = new Map((locales ?? []).map((l) => [l.name.toLowerCase(), l.id]))

  if (idPorLocal.size === 0) {
    if (esReal) {
      console.error(
        'No hay locales dados de alta. Créalos primero desde /admin/locales: sus nombres\n' +
          'tienen que coincidir con la columna "locales" del CSV.',
      )
      process.exit(1)
    }

    for (const nombre of LOCALES_DEMO) {
      const { data, error } = await supabase
        .from('locations')
        .insert({ name: nombre, active: true })
        .select('id')
        .single()

      if (error || !data) {
        console.error(`No se ha podido crear el local ${nombre}: ${error?.message}`)
        process.exit(1)
      }
      idPorLocal.set(nombre.toLowerCase(), data.id)
      console.log(`  ✓ local ${nombre}`)
    }
  }

  // ── Catálogo ──────────────────────────────────────────────────────────────
  const { validas, problemas } = interpretarCatalogo(leerCsv(ruta))

  if (problemas.length > 0) {
    console.warn(`\n${problemas.length} filas con problemas (no se importarán):`)
    for (const p of problemas.slice(0, 20)) console.warn(`  fila ${p.fila}: ${p.motivo}`)
    if (problemas.length > 20) console.warn(`  … y ${problemas.length - 20} más`)
  }

  if (validas.length === 0) {
    console.error('\nNo hay ninguna fila válida que cargar.')
    process.exit(1)
  }

  const idPorProveedor = new Map(
    (proveedoresExistentes ?? []).map((s) => [s.name.toLowerCase(), s.id]),
  )

  const proveedoresUnicos = new Map<string, FilaCatalogo>()
  for (const fila of validas) {
    if (!proveedoresUnicos.has(fila.proveedor.toLowerCase())) {
      proveedoresUnicos.set(fila.proveedor.toLowerCase(), fila)
    }
  }

  for (const [clave, fila] of proveedoresUnicos) {
    if (idPorProveedor.has(clave)) continue

    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        name: fila.proveedor,
        contact_channel: fila.canal,
        contact_value: fila.contacto,
      })
      .select('id')
      .single()

    if (error || !data) {
      console.error(`No se ha podido crear el proveedor ${fila.proveedor}: ${error?.message}`)
      process.exit(1)
    }
    idPorProveedor.set(clave, data.id)
    console.log(`  ✓ proveedor ${fila.proveedor}`)
  }

  // Pautas: deduplicadas por (proveedor, día), igual que el índice del esquema.
  const pautas = new Map<string, { supplierId: string; fila: FilaCatalogo }>()
  for (const fila of validas) {
    if (fila.diaPedido === null || fila.horaCorte === null) continue
    const supplierId = idPorProveedor.get(fila.proveedor.toLowerCase())
    if (supplierId) pautas.set(`${supplierId}::${fila.diaPedido}`, { supplierId, fila })
  }

  for (const { supplierId, fila } of pautas.values()) {
    await supabase.from('supplier_schedules').upsert(
      {
        supplier_id: supplierId,
        order_weekday: fila.diaPedido as number,
        cutoff_time: fila.horaCorte as string,
        delivery_weekday: fila.diaEntrega,
        lead_time_days: fila.plazoDias,
      },
      { onConflict: 'supplier_id,order_weekday' },
    )
  }
  console.log(`  ✓ ${pautas.size} pautas de pedido`)

  let productos = 0
  let asignaciones = 0
  const localesDesconocidos = new Set<string>()

  for (const fila of validas) {
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
      const { data, error } = await supabase.from('products').insert(datos).select('id').single()
      if (error || !data) {
        console.error(`No se ha podido crear ${fila.producto}: ${error?.message}`)
        continue
      }
      productId = data.id
    }
    productos += 1

    // El precio del CSV es del Excel: 'manual' = estimado, nunca 'real'.
    if (fila.ultimoPrecio !== null) {
      await supabase
        .from('price_history')
        .insert({ product_id: productId, price: fila.ultimoPrecio, source: 'manual' })
    }

    const destinos =
      fila.locales === null
        ? [...idPorLocal.values()]
        : fila.locales
            .map((n) => {
              const id = idPorLocal.get(n.toLowerCase())
              if (!id) localesDesconocidos.add(n)
              return id
            })
            .filter((id): id is string => Boolean(id))

    if (destinos.length > 0) {
      await supabase.from('location_products').upsert(
        destinos.map((location_id) => ({
          location_id,
          product_id: productId as string,
          active: true,
        })),
        { onConflict: 'location_id,product_id' },
      )
      asignaciones += destinos.length
    }
  }

  console.log(`  ✓ ${productos} productos`)
  console.log(`  ✓ ${asignaciones} asignaciones a locales`)

  if (localesDesconocidos.size > 0) {
    console.warn(
      `\nLocales del CSV que no existen y se han ignorado: ${[...localesDesconocidos].join(', ')}`,
    )
  }

  console.log('\nListo.')
  if (!esReal) {
    console.log(
      'Recuerda: esto es catálogo DEMO. El real se carga en la Fase 0 con\n' +
        '  npm run db:seed -- --real ruta/al/catalogo.csv\n' +
        'o desde /admin/importar.',
    )
  }
  console.log('Crea el primer usuario operador desde el panel de Supabase (Authentication →')
  console.log('Users) y ponle role = operador en la tabla profiles. A partir de ahí, el resto')
  console.log('de usuarios se dan de alta desde /admin/usuarios.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
