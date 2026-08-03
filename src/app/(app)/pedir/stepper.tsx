'use client'

import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { cantidad as formatearCantidad } from '@/lib/format'

/**
 * Stepper de cantidad.
 *
 * Detalles que no son cosméticos:
 *  · 44px de objetivo táctil, que es lo que ocupa un pulgar (CONTEXT.md §10.2).
 *  · El primer toque en "+" pone 1, no abre un teclado. Nadie escribe si puede
 *    pulsar (§10.4).
 *  · El "−" desaparece a 0 en vez de deshabilitarse: un botón muerto ocupa
 *    espacio y confunde.
 */
export function Stepper({
  valor,
  onCambio,
  etiquetaProducto,
  paso = 1,
}: {
  valor: number
  onCambio: (nuevo: number) => void
  etiquetaProducto: string
  paso?: number
}) {
  const pedido = valor > 0

  return (
    <div
      className={cn(
        'no-select flex items-center gap-1 rounded-full border transition-colors',
        pedido ? 'border-primary/40 bg-primary/5' : 'border-input bg-background',
      )}
    >
      {pedido ? (
        <button
          type="button"
          onClick={() => onCambio(Math.max(0, valor - paso))}
          aria-label={`Quitar uno de ${etiquetaProducto}`}
          className="flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors active:bg-accent"
        >
          <Minus className="h-5 w-5" />
        </button>
      ) : null}

      <span
        aria-live="polite"
        className={cn(
          'min-w-[2.5rem] text-center text-base font-semibold tabular-nums',
          pedido ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {pedido ? formatearCantidad(valor) : '—'}
      </span>

      <button
        type="button"
        onClick={() => onCambio(valor + paso)}
        aria-label={`Pedir ${etiquetaProducto}`}
        className="flex h-11 w-11 items-center justify-center rounded-full text-primary transition-colors active:bg-accent"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  )
}
