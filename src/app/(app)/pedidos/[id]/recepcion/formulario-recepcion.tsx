'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Loader2, TrendingDown, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import type { ProcedenciaCoste, TipoIncidencia } from '@/lib/database.types'
import { ETIQUETA_INCIDENCIA } from '@/lib/roles'
import { cantidad, eurosPrecisos, fecha, porcentaje } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { guardarRecepcion, recibirTodoCorrecto, type LineaRecepcion } from './acciones'

export type LineaRecepcionVista = {
  productId: string
  productName: string
  orderUnit: string
  esperado: number
  yaRecibido: number
  precioAnterior: number | null
  precioAnteriorTipo: ProcedenciaCoste
  precioAnteriorFecha: string | null
  qtyInicial: number
  precioInicial: number | null
  incidenciaInicial: TipoIncidencia
  notaInicial: string | null
}

type EstadoLinea = {
  qty: string
  precio: string
  incidencia: TipoIncidencia
  nota: string
  abierta: boolean
}

function aNumero(texto: string): number {
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/**
 * Confirmar lo recibido (MISE-005 y MISE-006).
 *
 * La forma de la pantalla sale del criterio de experiencia: una entrega sin
 * incidencias se confirma de un toque, y el detalle solo aparece cuando algo se
 * desvía. Por eso el botón grande no es "guardar" sino "todo correcto", y las
 * líneas empiezan plegadas con la cantidad pedida ya puesta.
 */
export function FormularioRecepcion({
  orderId,
  locationId,
  items,
  docRefInicial,
  hayRecepcionAbierta,
  umbralDesviacion,
}: {
  orderId: string
  locationId: string
  items: LineaRecepcionVista[]
  docRefInicial: string
  hayRecepcionAbierta: boolean
  umbralDesviacion: number
}) {
  const router = useRouter()
  const [docRef, setDocRef] = useState(docRefInicial)
  const [pendiente, iniciar] = useTransition()
  const [detalleVisible, setDetalleVisible] = useState(hayRecepcionAbierta)

  const [estado, setEstado] = useState<Record<string, EstadoLinea>>(() =>
    Object.fromEntries(
      items.map((i) => [
        i.productId,
        {
          qty: String(i.qtyInicial),
          precio: i.precioInicial === null ? '' : String(i.precioInicial),
          incidencia: i.incidenciaInicial,
          nota: i.notaInicial ?? '',
          abierta: false,
        } satisfies EstadoLinea,
      ]),
    ),
  )

  function actualizar(productId: string, cambios: Partial<EstadoLinea>) {
    setEstado((previo) => ({ ...previo, [productId]: { ...previo[productId], ...cambios } }))
  }

  const desviaciones = useMemo(() => {
    const mapa: Record<string, number | null> = {}
    for (const item of items) {
      const precio = aNumero(estado[item.productId]?.precio ?? '')
      if (!precio || !item.precioAnterior) {
        mapa[item.productId] = null
        continue
      }
      mapa[item.productId] = ((precio - item.precioAnterior) / item.precioAnterior) * 100
    }
    return mapa
  }, [items, estado])

  const hayDesviaciones = items.some((i) => {
    const d = desviaciones[i.productId]
    return d !== null && Math.abs(d) > umbralDesviacion
  })

  function construirLineas(): LineaRecepcion[] {
    return items.map((item) => {
      const linea = estado[item.productId]
      const qty = aNumero(linea.qty)
      const precio = linea.precio.trim() === '' ? null : aNumero(linea.precio)

      // Si falta género y nadie eligió motivo, se marca "falta" solo. Es el caso
      // de "no reportarlo sale gratis" que MISE-005 quiere cerrar.
      const incidencia: TipoIncidencia =
        linea.incidencia === 'ninguna' && qty < item.esperado ? 'falta' : linea.incidencia

      return {
        productId: item.productId,
        qtyReceived: qty,
        unitPriceActual: precio,
        incidence: incidencia,
        note: linea.nota.trim() || null,
      }
    })
  }

  function ejecutar(cerrar: boolean) {
    iniciar(async () => {
      const resultado = await guardarRecepcion(
        orderId,
        locationId,
        docRef.trim() || null,
        cerrar,
        construirLineas(),
      )

      if (resultado.ok) {
        toast.success(cerrar ? 'Recepción registrada' : 'Guardado, puedes seguir luego')
        router.refresh()
        if (cerrar) router.push(`/pedidos/${orderId}`)
      } else {
        toast.error('No se ha podido guardar', { description: resultado.mensaje })
      }
    })
  }

  return (
    <div className="space-y-4">
      {hayRecepcionAbierta ? (
        <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          Tienes una recepción a medias de este pedido. Se ha cargado tal como la dejaste.
        </div>
      ) : null}

      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="albaran">Nº de albarán</Label>
        <Input
          id="albaran"
          value={docRef}
          onChange={(e) => setDocRef(e.target.value)}
          placeholder="Opcional"
          autoCapitalize="characters"
        />
      </div>

      {!detalleVisible ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm">
              Si ha llegado todo lo que se pidió y sin novedades, con un toque queda
              registrado.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                size="lg"
                className="sm:w-auto"
                disabled={pendiente}
                onClick={() =>
                  iniciar(async () => {
                    const resultado = await recibirTodoCorrecto(
                      orderId,
                      locationId,
                      docRef.trim() || null,
                    )
                    if (resultado.ok) {
                      toast.success('Todo correcto, recepción registrada')
                      router.push(`/pedidos/${orderId}`)
                      router.refresh()
                    } else {
                      toast.error('No se ha podido registrar', {
                        description: resultado.mensaje,
                      })
                    }
                  })
                }
              >
                {pendiente ? <Loader2 className="animate-spin" /> : <Check />}
                Ha llegado todo correcto
              </Button>

              <Button variant="outline" size="lg" onClick={() => setDetalleVisible(true)}>
                Algo no cuadra
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Anotar el precio del albarán es opcional, pero es lo que hace que el panel y
              el escandallo dejen de trabajar con estimaciones. Está en &laquo;Algo no
              cuadra&raquo;.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <ul className="divide-y rounded-lg border">
            {items.map((item) => {
              const linea = estado[item.productId]
              const qty = aNumero(linea.qty)
              const desviacion = desviaciones[item.productId]
              const desviacionAlta =
                desviacion !== null && Math.abs(desviacion) > umbralDesviacion
              const falta = qty < item.esperado
              const sobra = qty > item.esperado

              return (
                <li key={item.productId} className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium leading-tight">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        Se pidió {cantidad(item.esperado)} {item.orderUnit}
                        {item.yaRecibido > 0
                          ? ` · ya recibido ${cantidad(item.yaRecibido)}`
                          : ''}
                      </p>
                    </div>

                    <Input
                      type="text"
                      inputMode="decimal"
                      aria-label={`Cantidad recibida de ${item.productName}`}
                      value={linea.qty}
                      onChange={(e) => actualizar(item.productId, { qty: e.target.value })}
                      className={cn(
                        'w-20 text-center tabular-nums',
                        falta && 'border-warn text-warn',
                        sobra && 'border-primary',
                      )}
                    />

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-expanded={linea.abierta}
                      aria-label={`Detalle de ${item.productName}`}
                      onClick={() => actualizar(item.productId, { abierta: !linea.abierta })}
                    >
                      <ChevronDown
                        className={cn('transition-transform', linea.abierta && 'rotate-180')}
                      />
                    </Button>
                  </div>

                  {falta && linea.incidencia === 'ninguna' ? (
                    <p className="mt-1 text-xs text-warn">
                      Falta género. Se registrará como incidencia &laquo;falta&raquo; salvo que
                      elijas otro motivo.
                    </p>
                  ) : null}

                  {linea.abierta ? (
                    <div className="mt-3 grid gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`precio-${item.productId}`}>
                          Precio real por {item.orderUnit || 'unidad'}
                        </Label>
                        <Input
                          id={`precio-${item.productId}`}
                          type="text"
                          inputMode="decimal"
                          placeholder={
                            item.precioAnterior === null
                              ? 'Sin precio anterior'
                              : String(item.precioAnterior)
                          }
                          value={linea.precio}
                          onChange={(e) =>
                            actualizar(item.productId, { precio: e.target.value })
                          }
                        />
                        {item.precioAnterior !== null ? (
                          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            Anterior {eurosPrecisos(item.precioAnterior)}
                            <Badge
                              variant={item.precioAnteriorTipo === 'real' ? 'real' : 'estimado'}
                            >
                              {item.precioAnteriorTipo === 'real' ? 'real' : 'estimado'}
                            </Badge>
                            {item.precioAnteriorFecha
                              ? `del ${fecha(item.precioAnteriorFecha)}`
                              : null}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            No hay precio anterior de este producto.
                          </p>
                        )}

                        {/* Aviso informativo, nunca bloqueante (MISE-006). */}
                        {desviacionAlta ? (
                          <p
                            className={cn(
                              'inline-flex items-center gap-1 text-xs font-medium',
                              (desviacion ?? 0) > 0 ? 'text-destructive' : 'text-ok',
                            )}
                          >
                            {(desviacion ?? 0) > 0 ? (
                              <TrendingUp className="h-3.5 w-3.5" />
                            ) : (
                              <TrendingDown className="h-3.5 w-3.5" />
                            )}
                            {(desviacion ?? 0) > 0 ? 'Sube' : 'Baja'} un{' '}
                            {porcentaje(Math.abs(desviacion ?? 0), 1)} sobre{' '}
                            {eurosPrecisos(item.precioAnterior)}
                          </p>
                        ) : null}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor={`incidencia-${item.productId}`}>Incidencia</Label>
                        <Select
                          id={`incidencia-${item.productId}`}
                          value={linea.incidencia}
                          onChange={(e) =>
                            actualizar(item.productId, {
                              incidencia: e.target.value as TipoIncidencia,
                            })
                          }
                        >
                          {(
                            Object.keys(ETIQUETA_INCIDENCIA) as (keyof typeof ETIQUETA_INCIDENCIA)[]
                          ).map((clave) => (
                            <option key={clave} value={clave}>
                              {ETIQUETA_INCIDENCIA[clave]}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor={`nota-${item.productId}`}>Nota</Label>
                        <Textarea
                          id={`nota-${item.productId}`}
                          rows={2}
                          className="min-h-0"
                          placeholder="Lo que haga falta recordar al reclamar"
                          value={linea.nota}
                          onChange={(e) => actualizar(item.productId, { nota: e.target.value })}
                        />
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>

          {hayDesviaciones ? (
            <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
              Hay precios que se desvían más de un {umbralDesviacion} % del último conocido.
              Queda registrado y aparecerá en el panel; puedes guardar igualmente.
            </div>
          ) : null}

          <div className="safe-bottom sticky bottom-16 flex flex-col gap-2 border-t bg-background/95 py-3 backdrop-blur sm:flex-row md:bottom-0">
            <Button size="lg" disabled={pendiente} onClick={() => ejecutar(true)}>
              {pendiente ? <Loader2 className="animate-spin" /> : <Check />}
              Confirmar recepción
            </Button>
            <Button
              variant="outline"
              size="lg"
              disabled={pendiente}
              onClick={() => ejecutar(false)}
            >
              Guardar y seguir luego
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
