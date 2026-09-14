import { CalendarClock } from 'lucide-react'
import { fecha as formatearFecha } from '@/lib/format'

/**
 * Cuándo viene alguien a este box, si viene.
 *
 * Una fecha y un icono, nada más. Va en la cabecera del box y en la del dueño
 * porque es la segunda pregunta que se hace al entrar —«¿cómo está?» y «¿y
 * ahora qué?»— y ninguna pantalla la contestaba. Cuando no hay nada planificado
 * no se pinta nada: una línea que dijera «sin visita» en todas las pantallas
 * acabaría siendo ruido fijo.
 */
export function ProximaVisita({ fecha }: { fecha: string | null }) {
  if (!fecha) return null

  return (
    <span className="inline-flex items-center gap-1.5">
      <CalendarClock className="h-3.5 w-3.5 shrink-0" />
      Próxima visita: {formatearFecha(fecha)}
    </span>
  )
}