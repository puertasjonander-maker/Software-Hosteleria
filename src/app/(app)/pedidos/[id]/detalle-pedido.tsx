'use client'

import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, ChevronDown, Clock, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { CanalContacto, EstadoPedido } from '@/lib/database.types'
import type { EstadoCorte } from '@/lib/cutoff'
import { duracionRelativa } from '@/lib/time'
import { cantidad, euros, fechaHora, plural } from '@/lib/format'
import { componerMensajePedido } from '@/lib/message'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EstadoVacio } from '@/components/ui/states'
import { cn } from '@/lib/utils'
import {
  actualizarCantidadLinea,
  anadirLinea,
  descartarBorrador,
  excluirLinea,
} from '../acciones'
import { EnviarPedido } from './enviar-pedido'

export type LineaDetalle = {
  id: string
  productId: string
  productName: string
  orderUnit: string
  category: string
  qtyTotal: number
  unitPriceExpected: number | null
  desglose: { locationId: string; locationName: string; qty: number }[]
  solicitantes: {
    nombre: string
    localNombre: string
    qty: number
    cuando: string
    nota: string | null
  }[]
}

type ProductoCatalogo = {
  id: string
  nombre: string
  unidadPedido: string
  categoria: string
}

function FilaLinea({
  linea,
  orderId,
  puedeEditar,
}: {
  linea: LineaDetalle
  orderId: string
  puedeEditar: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [valor, setValor] = useState(String(linea.qtyTotal))
  const [pendiente, iniciar] = useTransition()

  const importe =
    linea.unitPriceExpected === null ? null : linea.unitPriceExpected * linea.qtyTotal

  function guardar() {
    const numero = Number(valor.replace(',', '.'))
    if (numero === linea.qtyTotal) return

    iniciar(async () => {
      const resultado = await actualizarCantidadLinea(linea.id, numero, orderId)
      if (!resultado.ok) {
        setValor(String(linea.qtyTotal))
        toast.error(resultado.mensaje)
      }
    })
  }

  return (
    <li className="border-b last:border-b-0">
      <div className="flex items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-tight">{linea.productName}</p>
          <p className="text-xs text-muted-foreground">
            {linea.orderUnit}
            {importe !== null ? ` · ${euros(importe)} estimado` : ' · sin precio conocido'}
          </p>

          {/* El desglose por local es expandible: por defecto sería ruido para
              alguien que solo quiere mandar el pedido (MISE-002, criterio visual). */}
          {linea.desglose.length > 0 || linea.solicitantes.length > 0 ? (
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              aria-expanded={abierto}
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              <ChevronDown
                className={cn('h-3.5 w-3.5 transition-transform', abierto && 'rotate-180')}
              />
              {linea.desglose.length > 0
                ? linea.desglose.map((d) => `${d.locationName} ${cantidad(d.qty)}`).join(' · ')
                : 'Añadida a mano'}
            </button>
          ) : null}
        </div>

        {puedeEditar ? (
          <>
            <Input
              type="text"
              inputMode="decimal"
              aria-label={`Cantidad de ${linea.productName}`}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onBlur={guardar}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              className="w-20 text-center tabular-nums"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Quitar ${linea.productName} del pedido`}
              disabled={pendiente}
              onClick={() =>
                iniciar(async () => {
                  const resultado = await excluirLinea(linea.id, orderId)
                  if (resultado.ok) {
                    toast.success(`${linea.productName} vuelve a la bandeja`, {
                      description: 'Entrará en el siguiente pedido de este proveedor.',
                    })
                  } else {
                    toast.error(resultado.mensaje)
                  }
                })
              }
            >
              {pendiente ? <Loader2 className="animate-spin" /> : <Trash2 />}
            </Button>
          </>
        ) : (
          <span className="font-semibold tabular-nums">{cantidad(linea.qtyTotal)}</span>
        )}
      </div>

      {abierto ? (
        <div className="space-y-1 bg-muted/40 px-3 pb-3 pt-1 text-xs">
          {linea.solicitantes.length === 0 ? (
            <p className="text-muted-foreground">
              Nadie la solicitó: la añadió el encargado al preparar el pedido.
            </p>
          ) : (
            linea.solicitantes.map((s, i) => (
              <p key={i} className="text-muted-foreground">
                <span className="font-medium text-foreground">{cantidad(s.qty)}</span> ·{' '}
                {s.localNombre} · {s.nombre} · {fechaHora(s.cuando)}
                {s.nota ? ` · "${s.nota}"` : ''}
              </p>
            ))
          )}
        </div>
      ) : null}
    </li>
  )
}

function AnadirLinea({
  orderId,
  catalogo,
}: {
  orderId: string
  catalogo: ProductoCatalogo[]
}) {
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('1')
  const [pendiente, iniciar] = useTransition()

  if (catalogo.length === 0) return null

  return (
    <div className="flex flex-wrap items-end gap-2 border-t p-3">
      <div className="min-w-[12rem] flex-1 space-y-1">
        <Label htmlFor="anadir-producto" className="text-xs text-muted-foreground">
          Añadir algo que nadie ha pedido
        </Label>
        <Select
          id="anadir-producto"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          <option value="">Elige un producto…</option>
          {catalogo.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} ({p.unidadPedido})
            </option>
          ))}
        </Select>
      </div>

      <Input
        type="text"
        inputMode="decimal"
        aria-label="Cantidad"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        className="w-20 text-center tabular-nums"
      />

      <Button
        variant="outline"
        disabled={!productId || pendiente}
        onClick={() =>
          iniciar(async () => {
            const resultado = await anadirLinea(orderId, productId, Number(qty.replace(',', '.')))
            if (resultado.ok) {
              setProductId('')
              setQty('1')
            } else {
              toast.error(resultado.mensaje)
            }
          })
        }
      >
        {pendiente ? <Loader2 className="animate-spin" /> : <Plus />}
        Añadir
      </Button>
    </div>
  )
}

export function DetallePedido({
  pedido,
  proveedor,
  lineas,
  catalogo,
  locales,
  corte,
  puedeEditar,
  nombreUsuario,
}: {
  pedido: {
    id: string
    status: EstadoPedido
    channel: CanalContacto
    orderDate: string
    expectedDelivery: string | null
    supersedesId: string | null
  }
  proveedor: { id: string; nombre: string; canal: CanalContacto; contacto: string }
  lineas: LineaDetalle[]
  catalogo: ProductoCatalogo[]
  locales: { id: string; nombre: string }[]
  corte: { estado: EstadoCorte; etiqueta: string | null; minutosHasta: number | null }
  puedeEditar: boolean
  nombreUsuario: string
}) {
  const [entrega, setEntrega] = useState(pedido.expectedDelivery ?? '')
  const [pendienteDescartar, iniciarDescartar] = useTransition()

  const importeEstimado = useMemo(
    () =>
      lineas.reduce(
        (total, l) => total + (l.unitPriceExpected ?? 0) * l.qtyTotal,
        0,
      ),
    [lineas],
  )

  const hayLineaSinPrecio = lineas.some((l) => l.unitPriceExpected === null)

  // Los locales que aparecen en el pedido, no los tres siempre: si Teatinos no
  // pidió nada a este proveedor, no tiene por qué salir en el mensaje.
  const localesDelPedido = useMemo(() => {
    const ids = new Set(lineas.flatMap((l) => l.desglose.map((d) => d.locationId)))
    return locales.filter((l) => ids.has(l.id)).map((l) => l.nombre)
  }, [lineas, locales])

  const mensaje = useMemo(
    () =>
      componerMensajePedido({
        supplierName: proveedor.nombre,
        orderDate: pedido.orderDate,
        expectedDelivery: entrega || null,
        lines: lineas.map((l) => ({
          productName: l.productName,
          orderUnit: l.orderUnit,
          qtyTotal: l.qtyTotal,
        })),
        locationNames: localesDelPedido.length > 0 ? localesDelPedido : locales.map((l) => l.nombre),
        contactName: nombreUsuario,
      }),
    [proveedor.nombre, pedido.orderDate, entrega, lineas, localesDelPedido, locales, nombreUsuario],
  )

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{proveedor.nombre}</h1>
          <Badge variant="secondary">Borrador</Badge>
          {pedido.supersedesId ? <Badge variant="outline">Complementario</Badge> : null}
        </div>

        {corte.estado === 'vencido' ? (
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            El corte de hoy ya pasó. Este pedido puede entrar en la siguiente entrega.
          </p>
        ) : corte.etiqueta ? (
          <p
            className={cn(
              'inline-flex items-center gap-1.5 text-sm',
              corte.estado === 'proximo' ? 'font-medium text-warn' : 'text-muted-foreground',
            )}
          >
            <Clock className="h-4 w-4" />
            Corte {corte.etiqueta} · {duracionRelativa(corte.minutosHasta ?? 0)}
          </p>
        ) : null}
      </header>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {plural(lineas.length, 'línea', 'líneas')}
            </CardTitle>
            <span className="flex items-center gap-2 text-sm">
              {euros(importeEstimado)}
              <Badge variant="estimado">estimado</Badge>
            </span>
          </div>
          {hayLineaSinPrecio ? (
            <p className="text-xs text-muted-foreground">
              Hay líneas sin precio conocido: el importe estimado se queda corto.
            </p>
          ) : null}
        </CardHeader>

        <CardContent className="p-0">
          {lineas.length === 0 ? (
            <div className="p-4">
              <EstadoVacio
                titulo="Este borrador se ha quedado vacío"
                descripcion="Has excluido todas las líneas. Puedes añadir productos a mano o descartar el borrador."
              />
            </div>
          ) : (
            <ul>
              {lineas.map((linea) => (
                <FilaLinea
                  key={linea.id}
                  linea={linea}
                  orderId={pedido.id}
                  puedeEditar={puedeEditar}
                />
              ))}
            </ul>
          )}

          {puedeEditar ? <AnadirLinea orderId={pedido.id} catalogo={catalogo} /> : null}
        </CardContent>
      </Card>

      {puedeEditar ? (
        <>
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="entrega">Entrega prevista</Label>
            <Input
              id="entrega"
              type="date"
              value={entrega}
              onChange={(e) => setEntrega(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Se calcula con la pauta del proveedor. Cámbiala si has acordado otra cosa.
            </p>
          </div>

          <EnviarPedido
            orderId={pedido.id}
            mensaje={mensaje}
            canalPorDefecto={proveedor.canal}
            contacto={proveedor.contacto}
            proveedorNombre={proveedor.nombre}
            entrega={entrega || null}
            hayLineas={lineas.length > 0}
          />

          <div className="flex justify-end border-t pt-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={pendienteDescartar}
              onClick={() => {
                if (
                  !window.confirm(
                    'Se descarta el borrador y sus líneas vuelven a la bandeja de pendientes. ¿Seguimos?',
                  )
                ) {
                  return
                }
                iniciarDescartar(async () => {
                  await descartarBorrador(pedido.id)
                })
              }}
            >
              {pendienteDescartar ? <Loader2 className="animate-spin" /> : null}
              Descartar borrador
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}
