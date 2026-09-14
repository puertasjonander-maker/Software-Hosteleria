import { CalendarClock, CalendarX2 } from 'lucide-react'
import type { Semaforo } from '@/lib/database.types'
import type { ResumenParque } from '@/lib/parque'
import { CLASE_PUNTO_SEMAFORO, ETIQUETA_SEMAFORO, ORDEN_SEMAFORO } from '@/lib/roles'
import { plural } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * El semáforo de un parque de un vistazo (EBX-303).
 *
 * Los estados van en orden de urgencia, no alfabético ni por cantidad: lo primero
 * que se lee tiene que ser cuántas máquinas están mal. Los estados con cero
 * máquinas no se pintan — un "0 urgentes" ocupa lo mismo que un "3 urgentes" y
 * obliga a leerlo para descartarlo.
 */

const ESTADOS = (Object.keys(ETIQUETA_SEMAFORO) as Semaforo[]).sort(
  (a, b) => ORDEN_SEMAFORO[a] - ORDEN_SEMAFORO[b],
)

export function ResumenParque({
  resumen,
  className,
}: {
  resumen: ResumenParque
  className?: string
}) {
  if (resumen.total === 0) return null

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-3 py-2.5',
        className,
      )}
    >
      <span className="titulo-tarjeta">{plural(resumen.total, 'máquina', 'máquinas')}</span>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {ESTADOS.filter((e) => resumen.porEstado[e] > 0).map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5 texto-meta">
            <span
              className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', CLASE_PUNTO_SEMAFORO[e])}
            />
            <span className="tabular-nums font-semibold">{resumen.porEstado[e]}</span>
            <span className="text-muted-foreground">{ETIQUETA_SEMAFORO[e].toLowerCase()}</span>
          </span>
        ))}
      </div>

      {resumen.vencidas > 0 || resumen.proximas > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:ml-auto">
          {resumen.vencidas > 0 ? (
            <span className="inline-flex items-center gap-1.5 texto-meta text-destructive">
              <CalendarX2 className="h-3.5 w-3.5 shrink-0" />
              {plural(resumen.vencidas, 'revisión vencida', 'revisiones vencidas')}
            </span>
          ) : null}
          {resumen.proximas > 0 ? (
            <span className="inline-flex items-center gap-1.5 texto-meta text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              {resumen.proximas} en 30 días
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
