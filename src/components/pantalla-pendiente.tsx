import { HardHat } from 'lucide-react'
import { EstadoVacio } from '@/components/ui/states'

/**
 * Andamio de la fase 0.
 *
 * Cada ruta que el plan promete existe ya, con su sitio en la navegación y su
 * título, y dice en voz alta qué fase la construye. Es deliberado: una pantalla
 * que falta se descubre al pulsar y no se sabe si es un fallo; una que anuncia
 * cuándo llega no se vuelve a preguntar.
 *
 * Este componente desaparece cuando la última fase esté hecha. Si sigue aquí y
 * ya no lo importa nadie, se borra.
 */
export function PantallaPendiente({
  titulo,
  fase,
  descripcion,
}: {
  titulo: string
  fase: string
  descripcion: string
}) {
  return (
    <div className="container max-w-2xl py-6">
      <h1 className="titulo-pantalla">{titulo}</h1>
      <p className="mt-1 texto-meta">Pendiente · {fase}</p>
      <div className="mt-6">
        <EstadoVacio titulo="Todavía no está construida" descripcion={descripcion} icono={HardHat} />
      </div>
    </div>
  )
}
