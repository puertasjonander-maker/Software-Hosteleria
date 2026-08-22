import type { Metadata } from 'next'
import Link from 'next/link'
import { Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { exigirRol } from '@/lib/auth'
import { ETIQUETA_INCIDENCIA } from '@/lib/roles'
import { euros, plural, porcentaje } from '@/lib/format'
import {
  diasEnRango,
  DIAS_MINIMOS_TENDENCIA,
  mesDe,
  rangoDesdeParams,
} from '@/lib/rango-fechas'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AvisoDatosInsuficientes, EstadoError, EstadoVacio } from '@/components/ui/states'
import { GraficoGasto } from '@/components/graficos/grafico-gasto'
import { FiltroRango } from './filtro-rango'
import { EvolucionPrecio } from './evolucion-precio'

export const metadata: Metadata = { title: 'Panel' }
export const dynamic = 'force-dynamic'

type Agregado = { clave: string; etiqueta: string; importe: number; lineas: number }

function agrupar(
  filas: { importe: number; clave: string; etiqueta: string }[],
): Agregado[] {
  const mapa = new Map<string, Agregado>()
  for (const fila of filas) {
    const actual = mapa.get(fila.clave) ?? {
      clave: fila.clave,
      etiqueta: fila.etiqueta,
      importe: 0,
      lineas: 0,
    }
    actual.importe += fila.importe
    actual.lineas += 1
    mapa.set(fila.clave, actual)
  }
  return [...mapa.values()].sort((a, b) => b.importe - a.importe)
}

function TablaDesglose({
  titulo,
  filas,
  total,
}: {
  titulo: string
  filas: Agregado[]
  total: number
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {filas.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Sin datos en el rango.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right">Gasto</TableHead>
                <TableHead className="text-right">Peso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.clave}>
                  <TableCell className="font-medium">{f.etiqueta}</TableCell>
                  <TableCell className="text-right tabular-nums">{euros(f.importe)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {total > 0 ? porcentaje((100 * f.importe) / total, 0) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

export default async function PaginaPanel({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string }
}) {
  await exigirRol('operador')
  const supabase = createClient()

  const rango = rangoDesdeParams(searchParams)

  const [gasto, locales, productos] = await Promise.all([
    supabase
      .from('spend_lines')
      .select('*')
      .gte('spend_date', rango.desde)
      .lte('spend_date', rango.hasta),
    supabase.from('locations').select('id, name'),
    supabase.from('products').select('id, name, order_unit').eq('active', true).order('name'),
  ])

  if (gasto.error) {
    return (
      <div className="container max-w-6xl py-6">
        <EstadoError descripcion="No hemos podido cargar el gasto del periodo." />
      </div>
    )
  }

  const filas = gasto.data ?? []
  const nombreLocal = new Map((locales.data ?? []).map((l) => [l.id, l.name]))

  const total = filas.reduce((suma, f) => suma + Number(f.amount ?? 0), 0)
  const importeEstimado = filas
    .filter((f) => f.price_kind === 'estimado')
    .reduce((suma, f) => suma + Number(f.amount ?? 0), 0)

  const porMes = agrupar(
    filas.map((f) => {
      const mes = mesDe(f.spend_date)
      return { clave: mes.clave, etiqueta: mes.etiqueta, importe: Number(f.amount ?? 0) }
    }),
  ).sort((a, b) => a.clave.localeCompare(b.clave))

  const porProveedor = agrupar(
    filas.map((f) => ({
      clave: f.supplier_id,
      etiqueta: f.supplier_name,
      importe: Number(f.amount ?? 0),
    })),
  )

  const porLocal = agrupar(
    filas.map((f) => ({
      clave: f.location_id,
      etiqueta: nombreLocal.get(f.location_id) ?? 'Local',
      importe: Number(f.amount ?? 0),
    })),
  )

  const porCategoria = agrupar(
    filas.map((f) => ({
      clave: f.category,
      etiqueta: f.category,
      importe: Number(f.amount ?? 0),
    })),
  )

  const incidencias = new Map<
    string,
    { nombre: string; total: number; motivos: Record<string, number> }
  >()
  for (const f of filas) {
    if (f.incidence === 'ninguna') continue
    const actual = incidencias.get(f.product_id) ?? {
      nombre: f.product_name,
      total: 0,
      motivos: {},
    }
    actual.total += 1
    actual.motivos[f.incidence] = (actual.motivos[f.incidence] ?? 0) + 1
    incidencias.set(f.product_id, actual)
  }
  const topIncidencias = [...incidencias.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  const dias = diasEnRango(rango)
  const fechasConDatos = new Set(filas.map((f) => f.spend_date))
  const datosFlojos = fechasConDatos.size > 0 && dias < DIAS_MINIMOS_TENDENCIA

  return (
    <div className="container max-w-6xl space-y-6 py-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="titulo-pantalla">Panel</h1>
          <p className="text-sm text-muted-foreground">
            En qué se está yendo el dinero, con datos de lo que ha entrado por la puerta.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <FiltroRango rango={rango} />
          <Button asChild variant="outline">
            <Link
              href={`/api/panel/export?desde=${rango.desde}&hasta=${rango.hasta}`}
              prefetch={false}
            >
              <Download /> CSV
            </Link>
          </Button>
        </div>
      </header>

      {filas.length === 0 ? (
        <EstadoVacio
          titulo="Sin recepciones en este rango"
          descripcion="El panel se alimenta de lo recibido, no de lo pedido. En cuanto se registre una recepción aparecerá aquí."
        />
      ) : (
        <>
          {datosFlojos ? (
            <AvisoDatosInsuficientes
              mensaje={`El rango cubre ${plural(dias, 'día', 'días')}. Con menos de cuatro semanas de datos la tendencia todavía no es fiable: mira las cifras, no la pendiente.`}
            />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Gasto en el periodo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="cifra-dato text-[1.75rem] leading-8">{euros(total)}</p>
                <p className="text-xs text-muted-foreground">
                  {plural(filas.length, 'línea recibida', 'líneas recibidas')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Calidad del dato
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <p className="cifra-dato text-[1.75rem] leading-8">
                  {porcentaje(total > 0 ? (100 * (total - importeEstimado)) / total : 0, 0)}
                </p>
                {/* Un panel que mezcla precios reales con estimados sin decirlo
                    es un panel que engaña con buena letra (regla 7). */}
                <p className="text-xs text-muted-foreground">
                  del gasto con precio real de albarán. El resto usa el último precio
                  conocido: {euros(importeEstimado)} <Badge variant="estimado">estimado</Badge>
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Incidencias
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="cifra-dato text-[1.75rem] leading-8">
                  {filas.filter((f) => f.incidence !== 'ninguna').length}
                </p>
                <p className="text-xs text-muted-foreground">
                  líneas con falta, daño, precio distinto o sustitución
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Gasto por mes</CardTitle>
            </CardHeader>
            <CardContent>
              <GraficoGasto
                datos={porMes.map((m) => ({ periodo: m.etiqueta, importe: m.importe }))}
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <TablaDesglose titulo="Por proveedor" filas={porProveedor} total={total} />
            <TablaDesglose titulo="Por local" filas={porLocal} total={total} />
            <TablaDesglose titulo="Por categoría" filas={porCategoria} total={total} />
          </div>

          <EvolucionPrecio
            productos={(productos.data ?? []).map((p) => ({
              id: p.id,
              nombre: p.name,
              unidadPedido: p.order_unit,
            }))}
          />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Productos con más incidencias</CardTitle>
              <p className="text-sm text-muted-foreground">
                Lo que más veces ha llegado mal en el periodo. Sirve para saber con qué
                proveedor hay que sentarse.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {topIncidencias.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-muted-foreground">
                  Ninguna incidencia registrada en el rango.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Veces</TableHead>
                      <TableHead>Motivos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topIncidencias.map((i) => (
                      <TableRow key={i.nombre}>
                        <TableCell className="font-medium">{i.nombre}</TableCell>
                        <TableCell className="text-right tabular-nums">{i.total}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {Object.entries(i.motivos)
                            .map(
                              ([motivo, veces]) =>
                                `${ETIQUETA_INCIDENCIA[motivo as keyof typeof ETIQUETA_INCIDENCIA]} (${veces})`,
                            )
                            .join(', ')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
