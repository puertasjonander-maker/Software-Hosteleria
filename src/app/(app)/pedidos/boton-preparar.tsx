'use client'

import { useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { prepararPedido } from './acciones'

export function BotonPreparar({ supplierId }: { supplierId: string }) {
  const [pendiente, iniciar] = useTransition()

  return (
    <Button
      size="sm"
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
    </Button>
  )
}
