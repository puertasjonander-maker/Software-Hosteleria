import { CalendarClock, CalendarX2 } from 'lucide-react'
import type { Semaforo } from '@/lib/database.types'
import type { ResumenParque } from '@/lib/parque'
import { CLASE_PUNTO_SEMAFORO, ETIQUETA_SEMAFORO_PLURAL, ORDEN_SEMAFORO } from '@/lib/roles'
import { plural } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * El semáforo de un parque de un vistazo (EBX-303).
 *
 * Una barra segmentada: el ancho de cada tramo es la proporción de máquinas en
 * ese estado, y de un golpe de vista se ve «casi todo bien» o «esto está mal».
 * Debajo, la leyenda con el número exacto. Los estados van en orden de urgencia,
 * y los que tienen cero máquinas no se pintan.
 */

const ESTADOS = (Object.keys(ETIQUETA_SEMAFORO_PLURAL) as Semaforo[]).sort(
  (a, b) => ORDEN_SEMAFORO[a] - ORDEN_SEMAFORO[b],
)

export function BarraSalud({
  resumen,
  className,
}: {
  resumen: ResumenParque
  className?: string
}) {
  if (resumen.total === 0) return null
  return (
    <div
      role="img"
      aria-label={ESTADOS.filter((e) => resumen.porEstado[e] > 0)
        .map((e) => `${resumen.porEstado[e]} ${ETIQUETA_SEMAFORO_PLURAL[e].toLowerCase()}`)
        .join(', ')}
      className={cn('flex h-2 w-full gap-0.5 overflow-hidden rounded-full', className)}
    >
      {ESTADOS.filter((e) => resumen.porEstado[e] > 0).map((e) => (
        <span
          key={e}
          className={cn('h-full', CLASE_PUNTO_SEMAFORO[e])}
          style={{ flexGrow: resumen.porEstado[e], flexBasis: 0 }}
        />
      ))}
    </div>
  )
}

export function ResumenParque({
  resumen,
  className,
}: {
  resumen: ResumenParque
  className?: string
}) {
  if (resumen.total === 0) return null

  return (
    <div className={cn('space-y-3 rounded-xl border bg-card p-4 shadow-sm', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="whitespace-nowrap titulo-tarjeta">{plural(resumen.total, 'máquina', 'máquinas')}</p>
        {resumen.vencidas > 0 || resumen.proximas > 0 ? (
          <p className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            {resumen.vencidas > 0 ? (
              <span className="inline-flex items-center gap-1.5 texto-meta font-medium text-destructive">
                <CalendarX2 className="h-3.5 w-3.5 shrink-0" />
                {plural(resumen.vencidas, 'revisión vencida', 'revisiones vencidas')}
              </span>
            ) : null}
            {resumen.proximas > 0 ? (
              <span className="inline-flex items-center gap-1.5 texto-meta">
                <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                {resumen.proximas} en 30 días
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      <BarraSalud resumen={resumen} className="h-2.5" />

      <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
        {ESTADOS.filter((e) => resumen.porEstado[e] > 0).map((e) => (
          <li key={e} className="inline-flex items-center gap-2 texto-meta">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', CLASE_PUNTO_SEMAFORO[e])} />
            <span className="tabular-nums text-cuerpo font-semibold text-foreground">
              {resumen.porEstado[e]}
            </span>
            {ETIQUETA_SEMAFORO_PLURAL[e].toLowerCase()}
          </li>
        ))}
      </ul>
    </div>
  )
}
