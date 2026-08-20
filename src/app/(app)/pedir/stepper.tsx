'use client'

import { useEffect, useRef } from 'react'
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
 *  · Ese "−" no se monta de golpe: crece de 0 a 44 px en 200 ms. Apareciendo de
 *    golpe le pegaba un tirón de 44 px a la fila entera justo en el momento en
 *    que estás mirando lo que acabas de pedir.
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

  /*
   * La animación solo entra cuando el cambio lo ha hecho la persona. Al pintar
   * la lista, lo que ya estaba pedido tiene que estar ya puesto: animar el
   * estado inicial de veinte filas a la vez es ruido, no confirmación.
   *
   * Es una ref y no un estado a propósito. Con estado, el primer "+" pintaba el
   * botón sin animación y el efecto lo re-pintaba con ella: el "−" aparecía
   * entero y acto seguido se encogía a cero para volver a crecer.
   */
  const montado = useRef(false)
  useEffect(() => {
    montado.current = true
  }, [])

  const animar = montado.current

  return (
    <div
      className={cn(
        'no-select flex items-center gap-1 rounded-full border transition-colors duration-base ease-salida',
        pedido ? 'border-primary/40 bg-primary/5' : 'border-input bg-background',
      )}
    >
      {pedido ? (
        <button
          type="button"
          onClick={() => onCambio(Math.max(0, valor - paso))}
          aria-label={`Quitar uno de ${etiquetaProducto}`}
          className={cn(
            'flex h-11 items-center justify-center overflow-hidden rounded-full text-foreground',
            'transition-colors duration-rapido ease-estandar active:bg-accent',
            // Sin animación: 44 px desde el primer fotograma.
            animar ? 'w-11 animate-abrir-stepper' : 'w-11',
          )}
        >
          <Minus className="h-5 w-5 shrink-0" />
        </button>
      ) : null}

      <span
        aria-live="polite"
        className={cn(
          'min-w-[2.25rem] text-center text-base font-semibold tabular-nums',
          pedido ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <span
          // La `key` reinicia el pop en cada cambio de valor: sin ella, la
          // animación solo se vería la primera vez.
          key={valor}
          className={cn('inline-block', animar && pedido && 'animate-pop-cantidad')}
        >
          {pedido ? (
            formatearCantidad(valor)
          ) : (
            /*
             * El hueco de "no has pedido nada". Iba en el mismo tamaño y peso
             * que la cifra, y a 16 px semibold una raya así se lee como un "−"
             * apagado: parecía que el botón de quitar estaba deshabilitado en
             * vez de ausente. Fino y tenue, ya no compite con los dos botones.
             */
            <span aria-label="sin pedir" className="text-sm font-normal opacity-60">
              –
            </span>
          )}
        </span>
      </span>

      <button
        type="button"
        onClick={() => onCambio(valor + paso)}
        aria-label={`Pedir ${etiquetaProducto}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary transition-colors duration-rapido ease-estandar active:bg-accent"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  )
}
