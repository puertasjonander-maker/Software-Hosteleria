import { formasDe } from '@/lib/iconos-maquina'
import type { TipoMaquina } from '@/lib/database.types'
import { cn } from '@/lib/utils'

/**
 * El icono de una máquina, por su tipo.
 *
 * Hereda el color (`currentColor`) y el tamaño de donde se ponga, igual que los
 * iconos de lucide, así que se puede usar dentro de un texto con `size-5` o al lado
 * de un `MapPin` sin que desentone.
 */
export function IconoMaquina({
  tipo,
  className,
  /** Para lectores de pantalla. Sin esto el icono es decorativo, que es lo normal. */
  titulo,
}: {
  tipo: TipoMaquina
  className?: string
  titulo?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      /*
       * Fino y pequeño, que es como se lee una lista densa: a 16 px el trazo de 2
       * pide más atención de la que merece un icono que solo acompaña a un nombre.
       * Con 1.7 queda por debajo del peso del texto y el nombre sigue siendo lo
       * primero que se ve.
       */
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-4 shrink-0', className)}
      data-maquina={tipo}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
    >
      {formasDe(tipo).map((forma, i) =>
        forma.t === 'circle' ? (
          <circle key={i} cx={forma.cx} cy={forma.cy} r={forma.r} />
        ) : (
          <path key={i} d={forma.d} />
        ),
      )}
    </svg>
  )
}

/** Todos los tipos, en el orden en que se enseñan al elegir una máquina. */
export const TIPOS_DE_MAQUINA: TipoMaquina[] = [
  'rowerg',
  'skierg',
  'bikeerg',
  'air_bike',
  'cinta',
  'barra',
  'disco',
  'rack',
  'otro',
]