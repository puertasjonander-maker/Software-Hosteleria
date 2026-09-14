import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { useConsulta } from '@/lib/consulta'
import { useSesionActiva } from '@/lib/sesion'
import { miParque } from '@/datos/parque'
import { resumenUltimaVisita } from '@/datos/visitas'
import { peorSemaforo, resumirParque } from '@/lib/parque'
import { fecha as formatearFecha, plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Skeleton, SkeletonLista } from '@/components/ui/skeleton'
import { EstadoVacio } from '@/components/ui/states'
import { ChipSemaforo } from '@/components/chip-semaforo'
import { Cargador, useTitulo } from '@/components/cargador'
import { ListaParque } from '@/components/lista-parque'
import { ResumenParque } from '@/components/resumen-parque'
import { ValorParque } from '@/components/valor-parque'
import { valorDelParque } from '@/lib/valor'

/** Cuántos trabajos se enseñan antes de resumir el resto en «y N más». */
const TRABAJOS_VISIBLES = 4

/**
 * La vista del cliente (EBX-402).
 *
 * Solo lectura, y no porque la pantalla no enseñe botones: ninguna política de
 * escritura de la base de datos admite el rol `cliente`, en ninguna tabla.
 *
 * Lo que ve es exactamente su parque. No hay un filtro por box en esta consulta a
 * propósito: lo pone la RLS, que es la que no se puede olvidar.
 */
export default function MiBox() {
  useTitulo('Mi box')
  const sesion = useSesionActiva()

  const esCliente = sesion.perfil.rol === 'cliente'
  const tieneBox = Boolean(sesion.perfil.cliente_id)

  const consulta = useConsulta(
    async () => {
      if (!esCliente || !tieneBox) return { maquinas: [], ultima: null }
      const [maquinas, ultima] = await Promise.all([miParque(), resumenUltimaVisita()])
      return { maquinas, ultima }
    },
    [esCliente, tieneBox],
  )

  /*
   * Un interno que llega aquí no tiene box propio. En vez de una lista vacía sin
   * explicación, se le manda a la pantalla que sí es suya.
   */
  if (!esCliente) {
    return (
      <div className="container max-w-2xl py-6">
        <EstadoVacio
          titulo="Esta pantalla es la del dueño de un box"
          descripcion="Tú ves todos los boxes desde la pantalla de boxes, con el parque completo y las visitas."
          accion={
            <Button asChild variant="outline">
              <Link to="/boxes">Ir a boxes</Link>
            </Button>
          }
        />
      </div>
    )
  }

  /*
   * Un cliente sin box asignado no ve nada, y aquí lo decimos con palabras en vez
   * de con una lista vacía. Es el estado en el que nace un usuario recién
   * invitado: existe, entra, y todavía no está atado a ningún box.
   *
   * La acción es de verdad —escribirnos— y no un adorno: es el único camino que
   * tiene desde aquí para desbloquearse, y sin ella la pantalla era un callejón.
   */
  if (!tieneBox) {
    return (
      <div className="container max-w-2xl py-6">
        <EstadoVacio
          titulo="Tu usuario todavía no está asociado a ningún box"
          descripcion="Escríbenos y lo dejamos listo en un minuto. Hasta entonces no hay nada que enseñarte aquí."
          accion={
            <Button asChild variant="outline">
              <a href="mailto:hola@ergobox.es?subject=Asociar%20mi%20usuario%20a%20mi%20box">
                Escribir a hola@ergobox.es
              </a>
            </Button>
          }
        />
      </div>
    )
  }

  const box = sesion.cliente

  return (
    <div className="container max-w-3xl space-y-4 py-4 md:py-6">
      <Cargador
        consulta={consulta}
        esqueleto={
          <div className="space-y-4">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-24 w-full" />
            <SkeletonLista filas={6} />
          </div>
        }
      >
        {({ maquinas, ultima }) => {
          const resumen = resumirParque(maquinas)
          const peor = peorSemaforo(maquinas.filter((m) => m.activa).map((m) => m.estado))

          return (
            <>
              <header className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="titulo-pantalla">{box?.nombre ?? 'Mi box'}</h1>
                  {peor ? <ChipSemaforo estado={peor} /> : null}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 texto-meta">
                  {box?.direccion || box?.poblacion ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {[box?.direccion, box?.poblacion].filter(Boolean).join(', ')}
                    </span>
                  ) : null}
                </div>
              </header>

              {/*
               * El trabajo de la última vez, contado de una vez (JTBD-3). Antes solo
               * había una fecha en la cabecera, y para saber qué se hizo había que
               * abrir máquina a máquina.
               */}
              {ultima ? <UltimaVisita ultima={ultima} /> : null}

              {maquinas.length === 0 ? (
                <EstadoVacio
                  titulo="Tu parque todavía no está cargado"
                  descripcion="En cuanto pasemos a inventariar las máquinas, aparecen aquí con su estado y su historial."
                />
              ) : (
                <>
                  <ResumenParque resumen={resumen} />
                  <ValorParque valor={valorDelParque(maquinas)} />

                  <section className="space-y-3">
                    <h2 className="titulo-seccion">Tus máquinas</h2>
                    <p className="texto-meta">
                      Toca cualquiera para ver todo lo que se le ha hecho, con las fotos de cada
                      servicio.
                    </p>
                    <ListaParque maquinas={maquinas} base="/mi-box/maquinas" />
                  </section>
                </>
              )}
            </>
          )
        }}
      </Cargador>
    </div>
  )
}

/**
 * La última visita, en un bloque.
 *
 * Es un resumen: la fecha, cuántas máquinas se tocaron, qué se hizo —agrupado, sin
 * repetir el mismo trabajo doce veces— y un par de fotos del después. El detalle
 * completo, máquina a máquina, sigue estando a un toque, así que aquí no se
 * duplica el histórico: se enseña lo que se pregunta al entrar.
 */
function UltimaVisita({
  ultima,
}: {
  ultima: {
    fecha: string
    maquinas: number
    trabajos: { texto: string; veces: number }[]
    fotos: { id: string; url: string }[]
  }
}) {
  const visibles = ultima.trabajos.slice(0, TRABAJOS_VISIBLES)
  const restantes = ultima.trabajos.length - visibles.length

  return (
    <section className="space-y-3">
      <h2 className="titulo-seccion">Última visita</h2>

      <div className="rounded-lg border bg-card px-3 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="titulo-tarjeta">{formatearFecha(ultima.fecha)}</span>
          <span className="texto-meta text-muted-foreground">
            {plural(ultima.maquinas, 'máquina tocada', 'máquinas tocadas')}
          </span>
        </div>

        {visibles.length > 0 ? (
          <ul className="mt-2 space-y-0.5">
            {visibles.map((t) => (
              <li key={t.texto} className="line-clamp-2 texto-meta">
                {t.texto}
                {/* Una máquina sola no lleva «×1»: el número solo dice algo cuando repite. */}
                {t.veces > 1 ? (
                  <span className="text-muted-foreground"> ×{t.veces}</span>
                ) : null}
              </li>
            ))}
            {restantes > 0 ? (
              <li className="texto-micro text-muted-foreground">
                Y {restantes} más, en la ficha de cada máquina.
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="mt-2 texto-meta text-muted-foreground">
            En esa visita no quedó ningún parte cerrado con trabajo apuntado.
          </p>
        )}

        {ultima.fotos.length > 0 ? (
          <div className="mt-3 space-y-1">
            <p className="texto-micro font-semibold uppercase tracking-wide text-muted-foreground">
              Después
            </p>
            <div className="flex gap-2">
              {ultima.fotos.map((f) => (
                <a
                  key={f.id}
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 overflow-hidden rounded-md border transition-opacity duration-rapido ease-estandar hover:opacity-90"
                >
                  <img
                    src={f.url}
                    alt="Foto de después de la última visita"
                    loading="lazy"
                    className="h-20 w-20 object-cover"
                  />
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
