import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { exigirRol } from '@/lib/auth'
import { cantidad, euros, eurosPrecisos, fecha, porcentaje } from '@/lib/format'
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
import { EtiquetaCoste, esCosteDesactualizado } from '@/components/etiqueta-coste'
import { GraficoCoste } from '@/components/graficos/grafico-coste'
import { EditorPvp } from './editor-pvp'

export const metadata: Metadata = { title: 'Elaboración' }
export const dynamic = 'force-dynamic'

export default async function PaginaElaboracion({ params }: { params: { id: string } }) {
  await exigirRol('encargado', 'operador')
  const supabase = createClient()

  const { data: receta } = await supabase
    .from('recipe_current_cost')
    .select('*')
    .eq('recipe_id', params.id)
    .maybeSingle()

  if (!receta) notFound()

  const [lineas, snapshots] = await Promise.all([
    supabase.from('recipe_lines').select('*').eq('recipe_id', params.id),
    supabase
      .from('recipe_cost_snapshots')
      .select('*')
      .eq('recipe_id', params.id)
      .order('calculated_at'),
  ])

  const idsProducto = (lineas.data ?? [])
    .map((l) => l.product_id)
    .filter((id): id is string => Boolean(id))

  const [productos, precios] = await Promise.all([
    idsProducto.length
      ? supabase.from('products').select('*').in('id', idsProducto)
      : Promise.resolve({ data: [] as never[] }),
    idsProducto.length
      ? supabase.from('product_current_price').select('*').in('product_id', idsProducto)
      : Promise.resolve({ data: [] as never[] }),
  ])

  const porProducto = new Map((productos.data ?? []).map((p) => [p.id, p]))
  const precioPorProducto = new Map((precios.data ?? []).map((p) => [p.product_id, p]))

  const detalleLineas = (lineas.data ?? []).map((linea) => {
    const producto = linea.product_id ? porProducto.get(linea.product_id) : null
    const precio = linea.product_id ? precioPorProducto.get(linea.product_id) : null

    // Merma: para servir `qty` hay que comprar `qty / (1 - merma)`.
    const cantidadBruta = Number(linea.qty) / (1 - Number(linea.waste_pct) / 100)
    const costeUnitario = precio?.unit_cost_base ? Number(precio.unit_cost_base) : null

    // Un desajuste de unidad (el escandallo pide kg y el producto se cuenta por
    // unidades) no se resuelve adivinando un factor: se muestra como problema.
    const unidadDescuadrada = Boolean(producto && producto.base_unit !== linea.unit)

    return {
      id: linea.id,
      nombreOriginal: linea.raw_ingredient_name,
      productoNombre: producto?.name ?? null,
      mapeado: linea.mapping_status === 'mapeado',
      qty: Number(linea.qty),
      unidad: linea.unit,
      merma: Number(linea.waste_pct),
      cantidadBruta,
      costeUnitario,
      procedencia: precio?.price_kind ?? 'sin_dato',
      fechaPrecio: precio?.price_date ?? null,
      unidadDescuadrada,
      coste:
        costeUnitario === null || unidadDescuadrada ? null : cantidadBruta * costeUnitario,
    }
  })

  const desactualizado = esCosteDesactualizado(receta.oldest_price_date)
  const hayUnidadesDescuadradas = detalleLineas.some((l) => l.unidadDescuadrada)

  const puntos = (snapshots.data ?? []).map((s) => ({
    fechaISO: s.calculated_at,
    coste: Number(s.cost_per_yield),
    esReal: s.is_real,
  }))

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/escandallo">
          <ArrowLeft /> Elaboraciones
        </Link>
      </Button>

      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{receta.name}</h2>
        <p className="text-sm text-muted-foreground">
          Rinde {cantidad(receta.yield_qty)} {receta.yield_unit} ·{' '}
          {receta.mapped_lines}/{receta.total_lines} ingredientes mapeados
        </p>
      </header>

      {receta.has_gaps ? (
        <div className="flex items-start gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Esta elaboración no tiene coste porque le faltan mapeos. Preferimos enseñar el
            hueco a enseñar un coste incompleto que parezca fiable.{' '}
            <Link href="/escandallo/mapeo" className="font-medium underline">
              Resolver el mapeo
            </Link>
          </span>
        </div>
      ) : null}

      {hayUnidadesDescuadradas ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Hay líneas cuya unidad no coincide con la unidad base del producto mapeado. No
            se inventa la conversión: revisa el producto en el catálogo o cambia el mapeo.
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Coste por {receta.yield_unit}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <p className="text-2xl font-semibold tabular-nums">
              {receta.has_gaps ? '—' : eurosPrecisos(receta.cost_per_yield)}
            </p>
            <EtiquetaCoste
              tipo={receta.cost_kind}
              desactualizado={desactualizado}
              fechaDato={receta.oldest_price_date}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              PVP actual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EditorPvp
              recipeId={receta.recipe_id}
              pvpActual={receta.current_price}
              fijadoEn={receta.price_set_at}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Margen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-2xl font-semibold tabular-nums">
              {receta.has_gaps ? '—' : porcentaje(receta.margin_pct)}
            </p>
            <p className="text-xs text-muted-foreground">
              {receta.current_price === null
                ? 'Fija un PVP para calcularlo'
                : `Sobre ${euros(receta.current_price)} de venta`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ingredientes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ingrediente (Excel)</TableHead>
                <TableHead>Producto mapeado</TableHead>
                <TableHead className="text-right">Neto</TableHead>
                <TableHead className="text-right">Merma</TableHead>
                <TableHead className="text-right">Bruto</TableHead>
                <TableHead className="text-right">€/unidad</TableHead>
                <TableHead className="text-right">Coste</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detalleLineas.map((l) => (
                <TableRow key={l.id}>
                  {/* El nombre original nunca se pierde al mapear: es la
                      trazabilidad de por qué esta línea apunta ahí. */}
                  <TableCell className="font-medium">{l.nombreOriginal}</TableCell>

                  <TableCell>
                    {l.productoNombre ? (
                      <span className="flex flex-wrap items-center gap-1.5">
                        {l.productoNombre}
                        {l.unidadDescuadrada ? (
                          <Badge variant="destructive">unidad no cuadra</Badge>
                        ) : (
                          <Badge variant={l.procedencia === 'real' ? 'real' : 'estimado'}>
                            {l.procedencia === 'real'
                              ? 'real'
                              : l.procedencia === 'estimado'
                                ? 'estimado'
                                : 'sin precio'}
                          </Badge>
                        )}
                      </span>
                    ) : (
                      <Badge variant="hueco">sin mapear</Badge>
                    )}
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    {cantidad(l.qty)} {l.unidad}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.merma > 0 ? porcentaje(l.merma) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {cantidad(l.cantidadBruta)} {l.unidad}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.costeUnitario === null ? '—' : eurosPrecisos(l.costeUnitario)}
                    {l.fechaPrecio ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        {fecha(l.fechaPrecio)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {l.coste === null ? '—' : eurosPrecisos(l.coste)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cómo ha evolucionado el coste</CardTitle>
          <p className="text-sm text-muted-foreground">
            Se guarda un punto cada vez que el coste cambia, no cada vez que se recalcula.
          </p>
        </CardHeader>
        <CardContent>
          <GraficoCoste puntos={puntos} />
        </CardContent>
      </Card>
    </div>
  )
}
