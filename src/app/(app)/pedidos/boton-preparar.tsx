'use client'

import { useTransition } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { prepararPedido } from './acciones'

export function BotonPreparar({ supplierId }: { supplierId: string }) {
  const [pendiente, iniciar] = useTransition()

  return (
    <Button
      // Es la acción de la tarjeta y ahora vive al pie, donde acaba la lectura.
      // 44 px en el móvil: `sm` solo vale de escritorio para arriba, y esto se
      // pulsa de pie (button.tsx, y CONTEXT.md §10.2).
      className="shrink-0 sm:h-9 sm:px-3"
      disabled={pendiente}
      onClick={() =>
        iniciar(async () => {
          try {
            await prepararPedido(supplierId)
          } catch (error) {
            // `redirect()` de Next lanza a propósito: eso no es un fallo.
            if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) throw error
            toast.error('No se ha podido preparar el pedido', {
              description: 'Vuelve a intentarlo en un momento.',
            })
          }
        })
      }
    >
      {pendiente ? <Loader2 className="animate-spin" /> : null}
      Preparar pedido
      {pendiente ? null : <ArrowRight />}
    </Button>
  )
}
