import { AlertTriangle, ArrowRightLeft, ImageOff, PackageMinus, PackagePlus, Wrench } from 'lucide-react'
import type { TipoEvento } from '@/lib/database.types'
import type { EventoHistorico } from '@/datos/historico'
import { ETIQUETA_TIPO_EVENTO } from '@/lib/roles'
import { fecha as formatearFecha } from '@/lib/format'
import { ChipSemaforo } from '@/components/chip-semaforo'
import { EstadoVacio } from '@/components/ui/states'

/**
 * La línea de tiempo de una máquina (EBX-301).
 *
 * Es la pantalla que justifica la factura: cuando el dueño de un box pregunta qué
 * se ha hecho en su remo este año, esto es la respuesta. Por eso las fotos van
 * dentro del evento y no en una galería aparte — una foto sin la fecha y el
 * trabajo al lado no prueba nada.
 *
 * Las fotos llegan ya firmadas desde `datos/historico` y su enlace caduca en una
 * hora. Este componente solo las pinta: no decide quién puede verlas.
 */

const ICONO: Record<TipoEvento, React.ComponentType<{ className?: string }>> = {
  alta: PackagePlus,
  servicio: Wrench,
  cambio_estado: ArrowRightLeft,
  incidencia: AlertTriangle,
  baja: PackageMinus,
}

export function HistoricoMaquina({ eventos }: { eventos: EventoHistorico[] }) {
  if (eventos.length === 0) {
    return (
      <EstadoVacio
        titulo="Todavía no hay historial"
        descripcion="Se escribe solo: cada visita en la que se toque esta máquina deja aquí su línea con sus fotos."
      />
    )
  }

  return (
    <ol className="space-y-0">
      {eventos.map((e, i) => {
        const Icono = ICONO[e.tipo]
        const ultimo = i === eventos.length - 1

        return (
          <li key={e.id} className="flex gap-3">
            {/* Raíl y punto. El raíl se corta en el último para que la línea no
                quede colgando por debajo del final del historial. */}
            <div className="flex shrink-0 flex-col items-center">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border bg-card">
                <Icono className="h-4 w-4 text-muted-foreground" />
              </span>
              {!ultimo ? <span className="w-px flex-1 bg-border" /> : null}
            </div>

            <div className={ultimo ? 'min-w-0 flex-1 pb-1' : 'min-w-0 flex-1 pb-6'}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="titulo-tarjeta">{ETIQUETA_TIPO_EVENTO[e.tipo]}</span>
                <span className="texto-micro text-muted-foreground">
                  {formatearFecha(e.fecha)}
                </span>
                {e.estadoResultante ? <ChipSemaforo estado={e.estadoResultante} /> : null}
              </div>

              {e.texto ? <p className="mt-1 whitespace-pre-line texto-meta">{e.texto}</p> : null}

              {e.autor ? (
                <p className="mt-0.5 texto-micro text-muted-foreground">{e.autor}</p>
              ) : null}

              {e.fotos.length > 0 ? <Fotos fotos={e.fotos} /> : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Antes y después, en dos tiras.
 *
 * Se scrollan en horizontal en vez de envolverse: en el móvil, envolver seis
 * fotos empuja el siguiente evento fuera de la pantalla y el historial deja de
 * leerse como una línea de tiempo.
 */
function Fotos({ fotos }: { fotos: EventoHistorico['fotos'] }) {
  const grupos = [
    { momento: 'antes' as const, etiqueta: 'Antes', fotos: fotos.filter((f) => f.momento === 'antes') },
    {
      momento: 'despues' as const,
      etiqueta: 'Después',
      fotos: fotos.filter((f) => f.momento === 'despues'),
    },
  ].filter((g) => g.fotos.length > 0)

  return (
    <div className="mt-2 space-y-2">
      {grupos.map((g) => (
        <div key={g.momento} className="space-y-1">
          <p className="texto-micro font-semibold uppercase tracking-wide text-muted-foreground">
            {g.etiqueta}
          </p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {g.fotos.map((f) =>
              f.url ? (
                <a
                  key={f.id}
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 overflow-hidden rounded-md border transition-opacity duration-rapido ease-estandar hover:opacity-90"
                >
                  {/* La URL viene firmada y caduca en una hora, así que no se
                      cachea ni se optimiza en ningún sitio: se pide y se pinta. */}
                  <img
                    src={f.url}
                    alt={`Foto ${g.etiqueta.toLowerCase()}`}
                    loading="lazy"
                    className="h-24 w-24 object-cover"
                  />
                </a>
              ) : (
                <div
                  key={f.id}
                  className="flex h-24 w-24 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground"
                  title="La foto no se ha podido cargar"
                >
                  <ImageOff className="h-5 w-5" />
                </div>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
