import { Link, useSearchParams } from 'react-router-dom'
import { CalendarClock, CalendarX2 } from 'lucide-react'
import { useConsulta } from '@/lib/consulta'
import { cargarPanel } from '@/datos/panel'
import { ordenarPorUrgencia, textoRevision } from '@/lib/parque'
import { fecha as formatearFecha, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Skeleton, SkeletonLista } from '@/components/ui/skeleton'
import { EstadoVacio } from '@/components/ui/states'
import { ChipSemaforo, PuntoSemaforo } from '@/components/chip-semaforo'
import { Cargador, useTitulo } from '@/components/cargador'
import { ResumenParque } from '@/components/resumen-parque'

/** Los tres periodos que se miran de verdad: el mes, el trimestre y el año. */
const PERIODOS = [
  { dias: 30, etiqueta: '30 días' },
  { dias: 90, etiqueta: '90 días' },
  { dias: 365, etiqueta: '1 año' },
]

const DIAS_POR_DEFECTO = 90

/**
 * El panel (EBX-304).
 *
 * El periodo va en la dirección y no en un estado interno: así un panel filtrado
 * se puede guardar en favoritos o mandar por WhatsApp, y volver atrás deshace el
 * cambio de periodo en vez de salirse de la pantalla.
 */
export default function Panel() {
  useTitulo('Panel')
  const [params, setParams] = useSearchParams()

  const pedido = Number(params.get('dias'))
  const dias = PERIODOS.some((p) => p.dias === pedido) ? pedido : DIAS_POR_DEFECTO

  const consulta = useConsulta(() => cargarPanel(dias), [dias])

  return (
    <div className="container max-w-5xl space-y-5 py-4 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="titulo-pantalla">Panel</h1>

        <nav className="flex gap-1 rounded-lg border bg-card p-1">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              aria-current={p.dias === dias ? 'page' : undefined}
              onClick={() => setParams({ dias: String(p.dias) })}
              className={cn(
                'rounded-md px-3 py-1.5 text-meta font-medium transition-colors duration-rapido ease-estandar',
                p.dias === dias
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {p.etiqueta}
            </button>
          ))}
        </nav>
      </header>

      <Cargador
        consulta={consulta}
        esqueleto={
          <div className="space-y-5">
            <Skeleton className="h-14 w-full" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
            <SkeletonLista filas={5} />
          </div>
        }
      >
        {(datos) => {
          if (datos.maquinas.length === 0) {
            return (
              <EstadoVacio
                titulo="Todavía no hay parque que mirar"
                descripcion="En cuanto un box tenga máquinas dadas de alta, aquí aparece su estado y lo que le toca."
              />
            )
          }

          const pendientes = ordenarPorUrgencia(
            datos.maquinas.filter(
              (m) => m.activa && m.diasHastaRevision !== null && m.diasHastaRevision <= 30,
            ),
          )

          return (
            <>
              <ResumenParque resumen={datos.resumen} />

              <section className="grid gap-3 sm:grid-cols-3">
                <Cifra valor={datos.visitasHechas} etiqueta={`visitas terminadas en ${dias} días`} />
                <Cifra valor={datos.visitasAbiertas} etiqueta="visitas abiertas en ese periodo" />
                <Cifra
                  valor={datos.porBox.filter((b) => b.resumen.total > 0).length}
                  etiqueta="boxes con parque"
                />
              </section>

              <section className="space-y-3">
                <h2 className="titulo-seccion">Revisiones vencidas y próximas</h2>

                {pendientes.length === 0 ? (
                  <EstadoVacio
                    titulo="Nada vence en los próximos 30 días"
                    descripcion="Todo el parque con cadencia contratada está dentro de plazo."
                  />
                ) : (
                  <ul className="divide-y rounded-lg border bg-card">
                    {pendientes.slice(0, 20).map((m) => {
                      const revision = textoRevision(m)
                      const boxId = datos.clienteDeMaquina.get(m.id)
                      const vencida = (m.diasHastaRevision ?? 0) < 0

                      return (
                        <li key={m.id}>
                          <Link
                            to={`/boxes/${boxId}/maquinas/${m.id}`}
                            className="flex items-center gap-3 px-3 py-3 transition-colors duration-rapido ease-estandar hover:bg-accent"
                          >
                            {vencida ? (
                              <CalendarX2 className="h-4 w-4 shrink-0 text-destructive" />
                            ) : (
                              <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}

                            <div className="min-w-0 flex-1">
                              <span className="titulo-tarjeta">{m.nombre}</span>
                              <p className="truncate texto-meta">
                                {boxId ? datos.nombreDeBox.get(boxId) ?? 'Box' : 'Box'}
                              </p>
                            </div>

                            <div className="shrink-0 text-right">
                              <p
                                className={
                                  revision?.avisa
                                    ? 'texto-micro text-destructive'
                                    : 'texto-micro text-muted-foreground'
                                }
                              >
                                {revision?.texto}
                              </p>
                              <p className="texto-micro text-muted-foreground">
                                {formatearFecha(m.proximaRevision)}
                              </p>
                            </div>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {pendientes.length > 20 ? (
                  <p className="texto-meta">
                    Y {pendientes.length - 20} más. Se ven completas en la pantalla de cada box.
                  </p>
                ) : null}
              </section>

              <section className="space-y-3">
                <h2 className="titulo-seccion">Parque por box</h2>

                <ul className="divide-y rounded-lg border bg-card">
                  {datos.porBox.map((b) => (
                    <li key={b.id}>
                      <Link
                        to={`/boxes/${b.id}`}
                        className="flex items-center gap-3 px-3 py-3 transition-colors duration-rapido ease-estandar hover:bg-accent"
                      >
                        {b.peor ? (
                          <PuntoSemaforo estado={b.peor} />
                        ) : (
                          <span className="h-2.5 w-2.5 shrink-0" />
                        )}

                        <div className="min-w-0 flex-1">
                          <span
                            className={b.activo ? 'titulo-tarjeta' : 'titulo-tarjeta opacity-60'}
                          >
                            {b.nombre}
                          </span>
                          <p className="truncate texto-meta">
                            {[
                              b.poblacion,
                              b.resumen.total > 0
                                ? plural(b.resumen.total, 'máquina', 'máquinas')
                                : 'sin parque',
                              b.resumen.vencidas > 0
                                ? plural(b.resumen.vencidas, 'vencida', 'vencidas')
                                : null,
                              !b.activo ? 'inactivo' : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          {b.peor ? <ChipSemaforo estado={b.peor} /> : null}
                          <p className="mt-0.5 texto-micro text-muted-foreground">
                            {plural(b.visitas, 'visita', 'visitas')}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )
        }}
      </Cargador>
    </div>
  )
}

function Cifra({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <p className="text-2xl font-semibold tabular-nums">{valor}</p>
      <p className="texto-meta">{etiqueta}</p>
    </div>
  )
}
