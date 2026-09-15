import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { type MaquinaFila, ordenarPorUrgencia, textoRevision } from '@/lib/parque'
import { ETIQUETA_TIPO_MAQUINA } from '@/lib/roles'
import { fecha as formatearFecha } from '@/lib/format'
import { PuntoSemaforo } from '@/components/chip-semaforo'
import { IconoMaquina } from '@/components/icono-maquina'

/**
 * El parque de un box como lista (EBX-303).
 *
 * La misma lista para el técnico y para el dueño del box: lo único que cambia es
 * a dónde lleva cada fila, porque cada rol tiene su ruta hacia la ficha. Tenerla
 * dos veces acabaría con dos criterios de orden distintos y el cliente viendo su
 * parque ordenado alfabéticamente mientras nosotros lo vemos por urgencia.
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

  return (
    <ul className="divide-y rounded-lg border bg-card">
      {ordenadas.map((m) => {
        const revision = textoRevision(m)

        return (
          <li key={m.id}>
            <Link
              to={`${base}/${m.id}`}
              className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors duration-rapido ease-estandar hover:bg-accent"
            >
              <PuntoSemaforo estado={m.estado} />

              {/* El icono del tipo, junto al nombre: es lo que hace que una lista
                  de seis clases distintas se lea de un vistazo sin leer la línea
                  de detalle. */}
              <IconoMaquina tipo={m.tipo} className="text-muted-foreground" />

              <div className="min-w-0 flex-1">
                {/* "Fuera del parque" va fuera del texto meta, que se trunca, y en
                    su propia fila flex: puesto en línea con el nombre lo partía
                    por la mitad ("SkiErg" / "1 · Fuera del parque"). Lo que cede
                    es el nombre, con puntos suspensivos. */}
                {/* Envuelve en vez de encoger: con el aviso al lado y sin
                    `flex-wrap`, el nombre cedía todo el espacio y "SkiErg 1" se
                    quedaba en "Ski…". El `min-w` es lo que fuerza a que baje el
                    aviso y no el nombre. */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={
                      m.activa
                        ? 'min-w-[6rem] truncate titulo-tarjeta'
                        : 'min-w-[6rem] truncate titulo-tarjeta opacity-60'
                    }
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
                    className={
                      revision.avisa
                        ? 'texto-micro text-destructive'
                        : 'texto-micro text-muted-foreground'
                    }
                  >
                    {revision.texto}
                  </p>
                ) : (
                  <p className="texto-micro text-muted-foreground">sin cadencia</p>
                )}
                {m.ultimaRevision ? (
                  <p className="texto-micro text-muted-foreground">
                    últ. {formatearFecha(m.ultimaRevision)}
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
