'use client'

import { useMemo, useState, useTransition } from 'react'
import { Loader2, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { SimulatePriceChangeRow } from '@/lib/database.types'
import { euros, eurosPrecisos, plural, porcentaje } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

/**
 * "Si este producto sube un Y %, ¿a qué elaboraciones les pega y cuánto?"
 * (MISE-009).
 *
 * El cálculo se hace en Postgres y no aquí: es la misma aritmética de merma y
 * unidad base que usa el coste real, y duplicarla en JavaScript sería garantizar
 * que un día las dos versiones dejen de coincidir.
 */
export function Simulador({
  productos,
}: {
  productos: { id: string; nombre: string; unidadPedido: string }[]
}) {
  const supabase = useMemo(() => createClient(), [])
  const [productId, setProductId] = useState(productos[0]?.id ?? '')
  const [pct, setPct] = useState('10')
  const [resultados, setResultados] = useState<SimulatePriceChangeRow[] | null>(null)
  const [calculando, iniciar] = useTransition()

  const producto = productos.find((p) => p.id === productId)

  function simular() {
    const numero = Number(pct.replace(',', '.'))
    if (!Number.isFinite(numero)) {
      toast.error('Escribe un porcentaje válido')
      return
    }

    iniciar(async () => {
      const { data, error } = await supabase.rpc('simulate_price_change', {
        p_product_id: productId,
        p_pct: numero,
      })

      if (error) {
        toast.error('No se ha podido calcular', { description: error.message })
        return
      }
      setResultados(data ?? [])
    })
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Simular una subida de precio</CardTitle>
          <p className="text-sm text-muted-foreground">
            No cambia nada: solo calcula qué pasaría si ese proveedor subiera el precio.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1 space-y-1.5">
            <Label htmlFor="sim-producto">Producto</Label>
            <Select
              id="sim-producto"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.unidadPedido})
                </option>
              ))}
            </Select>
          </div>

          <div className="w-28 space-y-1.5">
            <Label htmlFor="sim-pct">Sube un %</Label>
            <Input
              id="sim-pct"
              inputMode="decimal"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
            />
          </div>

          <Button onClick={simular} disabled={!productId || calculando}>
            {calculando ? <Loader2 className="animate-spin" /> : <TrendingUp />}
            Calcular
          </Button>
        </CardContent>
      </Card>

      {resultados !== null ? (
        resultados.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ninguna elaboración con coste calculable usa este producto todavía.
          </p>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {plural(resultados.length, 'elaboración afectada', 'elaboraciones afectadas')}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Si {producto?.nombre} sube un {pct} %.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Elaboración</TableHead>
                    <TableHead className="text-right">Coste ahora</TableHead>
                    <TableHead className="text-right">Coste después</TableHead>
                    <TableHead className="text-right">Sube</TableHead>
                    <TableHead className="text-right">PVP</TableHead>
                    <TableHead className="text-right">Margen ahora</TableHead>
                    <TableHead className="text-right">Margen después</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultados.map((r) => (
                    <TableRow key={r.recipe_id}>
                      <TableCell className="font-medium">{r.recipe_name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {eurosPrecisos(r.current_cost)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {eurosPrecisos(r.simulated_cost)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-warn">
                        {porcentaje(r.cost_delta_pct, 2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {euros(r.current_price)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {porcentaje(r.current_margin_pct)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-medium tabular-nums',
                          r.simulated_margin_pct !== null &&
                            r.simulated_margin_pct < 40 &&
                            'text-destructive',
                        )}
                      >
                        {porcentaje(r.simulated_margin_pct)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      ) : null}
    </div>
  )
}
