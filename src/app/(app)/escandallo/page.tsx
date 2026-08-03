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
import { EtiquetaCoste, esCosteDesactualizado } from '@/components/etiqueta-coste'
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
        <div className="flex gap-1">
          {[
            ['margen', 'Por margen'],
            ['coste', 'Por coste'],
            ['nombre', 'Por nombre'],
          ].map(([clave, etiqueta]) => (
            <Button
              key={clave}
              asChild
              size="sm"
              variant={orden === clave ? 'secondary' : 'ghost'}
            >
              <Link href={`/escandallo?orden=${clave}`}>{etiqueta}</Link>
            </Button>
          ))}
        </div>

        {conHueco > 0 ? (
          <Button asChild size="sm" variant="outline">
            <Link href="/escandallo/mapeo">
              {conHueco} {conHueco === 1 ? 'elaboración' : 'elaboraciones'} con huecos
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="rounded-lg border">
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
                      r.margin_pct !== null && r.margin_pct < 60 && 'text-warn',
                      r.margin_pct !== null && r.margin_pct < 40 && 'text-destructive',
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

      <p className="text-xs text-muted-foreground">
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
