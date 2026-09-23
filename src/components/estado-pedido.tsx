import type { EstadoPedido } from '@/lib/database.types'
import { ETIQUETA_ESTADO_PEDIDO } from '@/lib/roles'
import { cn } from '@/lib/utils'

/*
 * El estado de un pedido se pintaba con dos mapas de estilos copiados en
 * `/pedidos` y en el detalle, y ya habían empezado a separarse (uno en
 * `font-semibold`, otro en `font-medium`). Una sola pieza, un solo aspecto.
 */
const ESTILO_ESTADO: Record<EstadoPedido, string> = {
  borrador: 'bg-muted text-muted-foreground',
  enviado: 'bg-primary/10 text-primary',
  recibido_parcial: 'bg-warn/15 text-warn',
  cerrado: 'bg-ok/15 text-ok',
}

export function EtiquetaEstadoPedido({
  estado,
  className,
}: {
  estado: EstadoPedido
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-micro font-semibold',
        ESTILO_ESTADO[estado],
        className,
      )}
    >
      {ETIQUETA_ESTADO_PEDIDO[estado]}
    </span>
  )
}
