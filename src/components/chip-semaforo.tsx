import type { Semaforo } from '@/lib/database.types'
import { CLASE_PUNTO_SEMAFORO, CLASE_SEMAFORO, ETIQUETA_SEMAFORO } from '@/lib/roles'
import { cn } from '@/lib/utils'

/**
 * El semáforo de una máquina o de un parque.
 *
 * Lleva siempre la palabra, no solo el color. Un semáforo de color puro deja
 * fuera a quien no distingue rojo de verde, que es entre el 4 y el 8 % de los
 * hombres, y este dato lo mira gente en el móvil a contraluz dentro de una nave.
 */
export function ChipSemaforo({
  estado,
  className,
}: {
  estado: Semaforo
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-micro font-semibold',
        CLASE_SEMAFORO[estado],
        className,
      )}
    >
      {ETIQUETA_SEMAFORO[estado]}
    </span>
  )
}

/**
 * Punto de color para las listas largas, donde repetir la palabra doce veces
 * seguidas es ruido. Nunca va solo: la fila que lo lleva dice el estado en su
 * texto accesible.
 */
export function PuntoSemaforo({ estado }: { estado: Semaforo }) {
  return (
    <span
      role="img"
      aria-label={ETIQUETA_SEMAFORO[estado]}
      className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', CLASE_PUNTO_SEMAFORO[estado])}
    />
  )
}
