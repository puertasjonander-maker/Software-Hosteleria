'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { Copy, FilePlus2, Loader2, PackageOpen } from 'lucide-react'
import { toast } from 'sonner'
import type { EstadoPedido } from '@/lib/database.types'
import { ETIQUETA_CANAL, ETIQUETA_ESTADO_PEDIDO } from '@/lib/roles'
import { cantidad, euros, fecha, fechaHora, plural } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { crearComplementario } from '../acciones'
import type { LineaDetalle } from './detalle-pedido'

const ESTILO_ESTADO: Record<EstadoPedido, string> = {
  borrador: 'bg-muted text-muted-foreground',
  enviado: 'bg-primary/10 text-primary',
  recibido_parcial: 'bg-warn/15 text-warn',
  cerrado: 'bg-ok/15 text-ok',
}

/**
 * Un pedido ya enviado. Solo lectura por diseño (MISE-003): lo que se muestra
 * es `message_snapshot`, el texto literal que salió, y no una recomposición a
 * partir de las líneas actuales. Si el catálogo cambia mañana, esta pantalla
 * sigue diciendo lo que de verdad se pidió.
 */
export function PedidoEnviado({
  pedido,
  proveedorNombre,
  enviadoPor,
  lineas,
  puedeGestionar,
}: {
  pedido: {
    id: string
    status: EstadoPedido
    channel: string
    sentAt: string | null
    expectedDelivery: string | null
    snapshot: string | null
    supersedesId: string | null
  }
  proveedorNombre: string
  enviadoPor: string | null
  lineas: LineaDetalle[]
  puedeGestionar: boolean
}) {
  const [pendiente, iniciar] = useTransition()

  const importe = lineas.reduce(
    (total, l) => total + (l.unitPriceExpected ?? 0) * l.qtyTotal,
    0,
  )

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="titulo-pantalla">{proveedorNombre}</h1>
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-medium',
              ESTILO_ESTADO[pedido.status],
            )}
          >
            {ETIQUETA_ESTADO_PEDIDO[pedido.status]}
          </span>
          {pedido.supersedesId ? <Badge variant="outline">Complementario</Badge> : null}
        </div>

        <p className="text-sm text-muted-foreground">
          Enviado por {ETIQUETA_CANAL[pedido.channel as keyof typeof ETIQUETA_CANAL]} el{' '}
          {fechaHora(pedido.sentAt)}
          {enviadoPor ? ` por ${enviadoPor}` : ''}
          {pedido.expectedDelivery ? ` · entrega prevista ${fecha(pedido.expectedDelivery)}` : ''}
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={`/pedidos/${pedido.id}/recepcion`}>
            <PackageOpen /> Recepcionar
          </Link>
        </Button>

        {puedeGestionar ? (
          <Button
            variant="outline"
            disabled={pendiente}
            onClick={() =>
              iniciar(async () => {
                try {
                  await crearComplementario(pedido.id)
                } catch (error) {
                  if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) throw error
                  toast.error('No se ha podido crear el pedido complementario')
                }
              })
            }
          >
            {pendiente ? <Loader2 className="animate-spin" /> : <FilePlus2 />}
            Pedido complementario
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{plural(lineas.length, 'línea', 'líneas')}</CardTitle>
            <span className="flex items-center gap-2 text-sm">
              {euros(importe)}
              <Badge variant="estimado">estimado</Badge>
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <ul>
            {lineas.map((linea) => (
              <li
                key={linea.id}
                className="flex items-center gap-3 border-b p-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium leading-tight">{linea.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {linea.orderUnit}
                    {linea.desglose.length > 0
                      ? ` · ${linea.desglose
                          .map((d) => `${d.locationName} ${cantidad(d.qty)}`)
                          .join(' · ')}`
                      : ''}
                  </p>
                </div>
                <span className="font-semibold tabular-nums">{cantidad(linea.qtyTotal)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {pedido.snapshot ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Lo que se envió</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(pedido.snapshot ?? '')
                    toast.success('Texto copiado')
                  } catch {
                    toast.error('Tu navegador no ha dejado copiar')
                  }
                }}
              >
                <Copy /> Copiar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
              {pedido.snapshot}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
