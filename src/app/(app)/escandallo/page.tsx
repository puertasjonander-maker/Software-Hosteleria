import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, FileSpreadsheet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { euros, eurosPrecisos, fecha, porcentaje } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EstadoError, EstadoVacio } from '@/components/ui/states'
import { claseMargen, EtiquetaCoste, esCosteDesactualizado } from '@/components/etiqueta-coste'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Escandallo' }
export const dynamic = 'force-dynamic'

export default async function PaginaEscandallo({
  searchParams,
}: {
  searchParams: { orden?: string }
}) {
  const supabase = createClient()

  const { data: elaboraciones, error } = await supabase
    .from('recipe_current_cost')
    .select('*')
    .eq('active', true)

  if (error) {
    return <EstadoError descripcion="No hemos podido cargar las elaboraciones." />
  }

  if (!elaboraciones || elaboraciones.length === 0) {
    return (
      <EstadoVacio
        titulo="Todavía no hay escandallo importado"
        descripcion="Sube el Excel que ya tenéis. No hace falta que esté perfecto: lo que no se pueda emparejar se queda marcado y se resuelve después."
        icono={FileSpreadsheet}
        accion={
          <Button asChild>
            <Link href="/escandallo/importar">Importar el Excel</Link>
          </Button>
        }
      />
    )
  }

  // Por margen ascendente por defecto: lo primero que quiere ver un operador es
  // lo que menos deja, no lo que más (MISE-009).
  const orden = searchParams.orden ?? 'margen'
  const lista = [...elaboraciones].sort((a, b) => {
    if (orden === 'coste') return (b.cost_per_yield ?? -1) - (a.cost_per_yield ?? -1)
    if (orden === 'nombre') return a.name.localeCompare(b.name, 'es')
    const ma = a.margin_pct ?? Number.POSITIVE_INFINITY
    const mb = b.margin_pct ?? Number.POSITIVE_INFINITY
    return ma - mb
  })

  const conHueco = lista.filter((r) => r.has_gaps).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Un control segmentado: se ve que las tres opciones son excluyentes
            y cuál está puesta. Antes eran tres botones sueltos de 36 px. */}
        <nav aria-label="Ordenar elaboraciones" className="flex rounded-lg bg-muted p-1">
          {[
            ['margen', 'Margen'],
            ['coste', 'Coste'],
            ['nombre', 'Nombre'],
          ].map(([clave, etiqueta]) => (
            <Link
              key={clave}
              href={`/escandallo?orden=${clave}`}
              aria-current={orden === clave ? 'true' : undefined}
              className={cn(
                'flex h-10 items-center rounded-md px-3 text-meta font-medium outline-none md:h-8',
                'transition-colors duration-rapido ease-estandar focus-visible:ring-2 focus-visible:ring-ring',
                orden === clave
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {etiqueta}
            </Link>
          ))}
        </nav>

        {conHueco > 0 ? (
          <Button asChild size="sm" variant="outline">
            <Link href="/escandallo/mapeo">
              {conHueco} {conHueco === 1 ? 'elaboración' : 'elaboraciones'} con huecos
            </Link>
          </Button>
        ) : null}
      </div>

      {/*
       * En el móvil, tarjetas: siete columnas en 390 px obligaban a desplazar
       * la tabla de lado para llegar al margen, que es justo lo que se viene a
       * mirar. Nombre y margen arriba; coste, PVP y procedencia debajo.
       */}
      <ul className="space-y-1.5 md:hidden">
        {lista.map((r) => (
          <li key={r.recipe_id}>
            <Link
              href={`/escandallo/${r.recipe_id}`}
              className="block rounded-lg border p-3 outline-none transition-colors duration-rapido ease-estandar hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-cuerpo font-semibold leading-5">{r.name}</p>
                  <p className="texto-meta">
                    {r.yield_qty} {r.yield_unit}
                    {r.has_gaps ? ` · ${r.mapped_lines}/${r.total_lines} mapeados` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={cn('cifra-dato', !r.has_gaps && claseMargen(r.margin_pct))}>
                    {r.has_gaps ? '—' : porcentaje(r.margin_pct)}
                  </p>
                  <p className="text-micro text-muted-foreground">margen</p>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-meta">
                <span className="tabular-nums">
                  <span className="text-muted-foreground">Coste </span>
                  {r.has_gaps ? '—' : eurosPrecisos(r.cost_per_yield)}
                </span>
                <span className="tabular-nums">
                  <span className="text-muted-foreground">PVP </span>
                  {euros(r.current_price)}
                </span>
                <EtiquetaCoste
                  tipo={r.cost_kind}
                  desactualizado={esCosteDesactualizado(r.oldest_price_date)}
                  fechaDato={r.oldest_price_date}
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Elaboración</TableHead>
              <TableHead className="text-right">Coste/ración</TableHead>
              <TableHead>Procedencia</TableHead>
              <TableHead className="text-right">PVP</TableHead>
              <TableHead className="text-right">Margen</TableHead>
              <TableHead className="text-right">Mapeo</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>

          <TableBody>
            {lista.map((r) => {
              const desactualizado = esCosteDesactualizado(r.oldest_price_date)

              return (
                <TableRow key={r.recipe_id}>
                  <TableCell className="font-medium">
                    <Link href={`/escandallo/${r.recipe_id}`} className="hover:underline">
                      {r.name}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {r.yield_qty} {r.yield_unit}
                    </span>
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    {/* Una elaboración con huecos no tiene coste: tiene un hueco.
                        Aquí no se enseña un número parcial (CONTEXT.md §7). */}
                    {r.has_gaps ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      eurosPrecisos(r.cost_per_yield)
                    )}
                  </TableCell>

                  <TableCell>
                    <EtiquetaCoste
                      tipo={r.cost_kind}
                      desactualizado={desactualizado}
                      fechaDato={r.oldest_price_date}
                    />
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    {euros(r.current_price)}
                  </TableCell>

                  <TableCell
                    className={cn(
                      'text-right font-medium tabular-nums',
                      !r.has_gaps && claseMargen(r.margin_pct),
                    )}
                  >
                    {r.has_gaps ? '—' : porcentaje(r.margin_pct)}
                  </TableCell>

                  <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                    {r.mapped_lines}/{r.total_lines}
                    {r.has_gaps ? (
                      <Badge variant="hueco" className="ml-2">
                        huecos
                      </Badge>
                    ) : null}
                  </TableCell>

                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="icon-sm">
                      <Link
                        href={`/escandallo/${r.recipe_id}`}
                        aria-label={`Abrir ${r.name}`}
                      >
                        <ArrowRight />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <p className="texto-meta">
        El margen se calcula sobre el PVP con IVA que hay fijado en cada elaboración. El
        coste solo se calcula cuando todos los ingredientes están mapeados; hasta
        entonces la fila muestra un hueco y no una estimación.
        {lista.some((r) => esCosteDesactualizado(r.oldest_price_date))
          ? ` Los costes marcados como desactualizados usan precios anteriores al ${fecha(
              new Date(Date.now() - 90 * 86400000),
            )}.`
          : ''}
      </p>
    </div>
  )
}
