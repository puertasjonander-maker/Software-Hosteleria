import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { useConsulta } from '@/lib/consulta'
import { useSesionActiva } from '@/lib/sesion'
import { miParque } from '@/datos/parque'
import { ultimaVisitaHecha } from '@/datos/visitas'
import { peorSemaforo, resumirParque } from '@/lib/parque'
import { fecha as formatearFecha } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Skeleton, SkeletonLista } from '@/components/ui/skeleton'
import { EstadoVacio } from '@/components/ui/states'
import { ChipSemaforo } from '@/components/chip-semaforo'
import { Cargador, useTitulo } from '@/components/cargador'
import { ListaParque } from '@/components/lista-parque'
import { ResumenParque } from '@/components/resumen-parque'

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
      const [maquinas, ultima] = await Promise.all([miParque(), ultimaVisitaHecha()])
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
   */
  if (!tieneBox) {
    return (
      <div className="container max-w-2xl py-6">
        <EstadoVacio
          titulo="Tu usuario todavía no está asociado a ningún box"
          descripcion="Escríbenos y lo dejamos listo en un minuto. Hasta entonces no hay nada que enseñarte aquí."
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
            <Skeleton className="h-14 w-full" />
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
                  {ultima ? <span>Última visita: {formatearFecha(ultima)}</span> : null}
                </div>
              </header>

              {maquinas.length === 0 ? (
                <EstadoVacio
                  titulo="Tu parque todavía no está cargado"
                  descripcion="En cuanto pasemos a inventariar las máquinas, aparecen aquí con su estado y su historial."
                />
              ) : (
                <>
                  <ResumenParque resumen={resumen} />

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
