import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { Semaforo } from '@/lib/database.types'
import { type MaquinaFila, ordenarPorUrgencia, textoRevision } from '@/lib/parque'
import {
  CLASE_PUNTO_SEMAFORO,
  ETIQUETA_SEMAFORO_PLURAL,
  ETIQUETA_TIPO_MAQUINA,
  ORDEN_SEMAFORO,
} from '@/lib/roles'
import { fechaCorta } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PuntoSemaforo } from '@/components/chip-semaforo'
import { IconoMaquina } from '@/components/icono-maquina'

/**
 * El parque de un box como lista (EBX-303).
 *
 * La misma lista para el técnico y para el dueño del box: lo único que cambia es
 * a dónde lleva cada fila, porque cada rol tiene su ruta hacia la ficha. Tenerla
 * dos veces acabaría con dos criterios de orden distintos y el cliente viendo su
 * parque ordenado alfabéticamente mientras nosotros lo vemos por urgencia.
 *
 * Va agrupada por estado, de lo peor a lo mejor: lo que hay que arreglar queda
 * arriba con su cabecera, y lo que está bien no compite con ello. Con menos de
 * seis máquinas no se agrupa; una cabecera por cada dos filas sería ruido.
 */
export function ListaParque({
  maquinas,
  /** Prefijo de la ficha: `/clientes/<id>/maquinas` o `/mi-box/maquinas`. */
  base,
}: {
  maquinas: MaquinaFila[]
  base: string
}) {
  const ordenadas = ordenarPorUrgencia(maquinas)
  const activas = ordenadas.filter((m) => m.activa)
  const fuera = ordenadas.filter((m) => !m.activa)

  const grupos = (Object.keys(ORDEN_SEMAFORO) as Semaforo[])
    .sort((a, b) => ORDEN_SEMAFORO[a] - ORDEN_SEMAFORO[b])
    .map((estado) => ({ estado, filas: activas.filter((m) => m.estado === estado) }))
    .filter((g) => g.filas.length > 0)

  if (activas.length < 6) {
    return (
      <div className="space-y-5">
        <Filas filas={ordenadas} base={base} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {grupos.map((g) => (
        <section key={g.estado} className="space-y-2">
          <h3 className="flex items-center gap-2 titulo-seccion">
            <span className={cn('h-2 w-2 rounded-full', CLASE_PUNTO_SEMAFORO[g.estado])} />
            {ETIQUETA_SEMAFORO_PLURAL[g.estado]}
            <span className="tabular-nums font-medium normal-case tracking-normal">
              {g.filas.length}
            </span>
          </h3>
          <Filas filas={g.filas} base={base} />
        </section>
      ))}
      {fuera.length > 0 ? (
        <section className="space-y-2">
          <h3 className="titulo-seccion">Fuera del parque · {fuera.length}</h3>
          <Filas filas={fuera} base={base} />
        </section>
      ) : null}
    </div>
  )
}

function Filas({ filas, base }: { filas: MaquinaFila[]; base: string }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
      {filas.map((m) => {
        const revision = textoRevision(m)

        return (
          <li key={m.id}>
            <Link
              to={`${base}/${m.id}`}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-rapido ease-estandar hover:bg-accent/60 active:bg-accent"
            >
              <PuntoSemaforo estado={m.estado} />

              {/* El icono del tipo, junto al nombre: es lo que hace que una lista
                  de seis clases distintas se lea de un vistazo sin leer la línea
                  de detalle. */}
              <IconoMaquina tipo={m.tipo} className="text-muted-foreground" />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={cn(
                      'min-w-[6rem] truncate titulo-tarjeta',
                      !m.activa && 'opacity-60',
                    )}
                  >
                    {m.nombre}
                  </span>
                  {!m.activa ? (
                    <span className="shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-micro font-semibold text-muted-foreground">
                      Fuera del parque
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate texto-meta">
                  {/* El nº de serie va primero a propósito: es el dato que
                      identifica la máquina —el de la etiqueta— y la línea se
                      corta con puntos suspensivos cuando no cabe. Con «Remo ·
                      Concept2 · nº 250…» lo que se perdía era justo lo único que
                      no se puede deducir del nombre. */}
                  {[m.numSerie ? `nº ${m.numSerie}` : null, ETIQUETA_TIPO_MAQUINA[m.tipo], m.marca]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>

              <div className="shrink-0 text-right">
                {revision ? (
                  <p
                    className={cn(
                      'text-meta font-semibold',
                      revision.avisa ? 'text-destructive' : 'text-foreground',
                    )}
                  >
                    {revision.texto}
                  </p>
                ) : (
                  <p className="texto-micro text-muted-foreground">sin cadencia</p>
                )}
                {m.ultimaRevision ? (
                  <p className="texto-micro text-muted-foreground">
                    últ. {fechaCorta(m.ultimaRevision)}
                  </p>
                ) : null}
              </div>

              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
