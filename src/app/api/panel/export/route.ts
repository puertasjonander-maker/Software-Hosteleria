import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ETIQUETA_INCIDENCIA } from '@/lib/roles'
import { rangoDesdeParams } from '@/lib/rango-fechas'

export const dynamic = 'force-dynamic'

const CABECERAS = [
  'fecha',
  'proveedor',
  'local',
  'categoria',
  'producto',
  'cantidad',
  'precio_unitario',
  'importe',
  'procedencia_precio',
  'incidencia',
] as const

/**
 * Escapa un campo para CSV. Excel en español abre el fichero con `;` como
 * separador, así que ese es el que se usa: un CSV que hay que importar a mano
 * con un asistente no es una exportación, es un trámite.
 */
function campo(valor: unknown): string {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

/** Coma decimal: es lo que espera una hoja de cálculo con configuración española. */
function numero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return ''
  return String(Math.round(valor * 10000) / 10000).replace('.', ',')
}

export async function GET(request: NextRequest) {
  const supabase = createClient()

  // Sin comprobación de rol explícita: la RLS de `spend_lines` ya limita lo que
  // cada usuario puede ver, y duplicar la regla aquí sería otro sitio donde
  // pueda desincronizarse.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sesión no válida' }, { status: 401 })
  }

  const params = request.nextUrl.searchParams
  const rango = rangoDesdeParams({
    desde: params.get('desde') ?? undefined,
    hasta: params.get('hasta') ?? undefined,
  })

  const [gasto, locales] = await Promise.all([
    supabase
      .from('spend_lines')
      .select('*')
      .gte('spend_date', rango.desde)
      .lte('spend_date', rango.hasta)
      .order('spend_date'),
    supabase.from('locations').select('id, name'),
  ])

  if (gasto.error) {
    return NextResponse.json({ error: gasto.error.message }, { status: 500 })
  }

  const nombreLocal = new Map((locales.data ?? []).map((l) => [l.id, l.name]))

  const lineas = [
    CABECERAS.join(';'),
    ...(gasto.data ?? []).map((f) =>
      [
        campo(f.spend_date),
        campo(f.supplier_name),
        campo(nombreLocal.get(f.location_id) ?? ''),
        campo(f.category),
        campo(f.product_name),
        numero(Number(f.qty_received)),
        numero(f.unit_price === null ? null : Number(f.unit_price)),
        numero(f.amount === null ? null : Number(f.amount)),
        campo(f.price_kind),
        campo(ETIQUETA_INCIDENCIA[f.incidence]),
      ].join(';'),
    ),
  ]

  // BOM al principio: sin él, Excel se come las tildes de "Panadería".
  const cuerpo = `﻿${lineas.join('\r\n')}\r\n`

  return new NextResponse(cuerpo, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mise-gasto-${rango.desde}-a-${rango.hasta}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
