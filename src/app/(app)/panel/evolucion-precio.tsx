'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { PriceHistoryRow } from '@/lib/database.types'
import { eurosPrecisos, fecha, porcentaje } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GraficoCoste } from '@/components/graficos/grafico-coste'

/**
 * Evolución del precio de compra de un producto (MISE-007).
 *
 * Reutiliza el gráfico del escandallo a propósito: la distinción entre punto
 * relleno (precio de albarán) y hueco (precio estimado) significa lo mismo aquí,
 * y aprender dos convenciones para lo mismo es una convención de más.
 */
export function EvolucionPrecio({
  productos,
}: {
  productos: { id: string; nombre: string; unidadPedido: string }[]
}) {
  const supabase = useMemo(() => createClient(), [])
  const [productId, setProductId] = useState(productos[0]?.id ?? '')
  const [historico, setHistorico] = useState<PriceHistoryRow[]>([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!productId) return
    let cancelado = false

    setCargando(true)
    supabase
      .from('price_history')
      .select('*')
      .eq('product_id', productId)
      .order('effective_date')
      .then(({ data }) => {
        if (cancelado) return
        setHistorico(data ?? [])
        setCargando(false)
      })

    return () => {
      cancelado = true
    }
  }, [productId, supabase])

  const producto = productos.find((p) => p.id === productId)

  const puntos = historico.map((h) => ({
    fechaISO: h.effective_date,
    coste: Number(h.price),
    esReal: h.source === 'recepcion',
  }))

  const primero = puntos[0]
  const ultimo = puntos[puntos.length - 1]
  const variacion =
    primero && ultimo && primero.coste > 0
      ? ((ultimo.coste - primero.coste) / primero.coste) * 100
      : null

  if (productos.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <CardTitle className="text-base">Evolución del precio de compra</CardTitle>
            <p className="text-sm text-muted-foreground">
              Por unidad de pedido{producto ? ` (${producto.unidadPedido})` : ''}.
            </p>
          </div>

          <div className="min-w-[16rem] space-y-1.5">
            <Label htmlFor="producto-precio" className="text-xs text-muted-foreground">
              Producto
            </Label>
            <Select
              id="producto-precio"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {cargando ? (
          <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando histórico…
          </p>
        ) : puntos.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Este producto no tiene ningún precio registrado todavía. El primero llegará con
            una recepción en la que se anote el precio del albarán.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span>
                Último: <strong className="tabular-nums">{eurosPrecisos(ultimo.coste)}</strong>{' '}
                <Badge variant={ultimo.esReal ? 'real' : 'estimado'}>
                  {ultimo.esReal ? 'real' : 'estimado'}
                </Badge>{' '}
                <span className="text-muted-foreground">del {fecha(ultimo.fechaISO)}</span>
              </span>
              {variacion !== null && puntos.length > 1 ? (
                <span className={variacion > 0 ? 'text-destructive' : 'text-ok'}>
                  {variacion > 0 ? 'Ha subido' : 'Ha bajado'}{' '}
                  {porcentaje(Math.abs(variacion))} desde {fecha(primero.fechaISO)}
                </span>
              ) : null}
            </div>

            <GraficoCoste puntos={puntos} />
          </>
        )}
      </CardContent>
    </Card>
  )
}
