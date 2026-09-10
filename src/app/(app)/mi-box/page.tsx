import type { Metadata } from 'next'
import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { exigirSesion } from '@/lib/auth'
import { comoMaquinaFila, peorSemaforo, resumirParque, type MaquinaFila } from '@/lib/parque'
import { fecha as formatearFecha } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { EstadoVacio } from '@/components/ui/states'
import { ChipSemaforo } from '@/components/chip-semaforo'
import { ListaParque } from '@/components/lista-parque'
import { ResumenParque } from '@/components/resumen-parque'

export const metadata: Metadata = { title: 'Mi box' }
export const dynamic = 'force-dynamic'

/**
 * La vista del cliente (EBX-402).
 *
 * Solo lectura, y no porque la pantalla no enseñe botones: ninguna política de
 * escritura de la base de datos admite el rol `cliente`, en ninguna tabla. Aunque
 * alguien llamara a una acción de servidor a mano, Postgres devolvería cero filas
 * afectadas.
 *
 * Lo que ve es exactamente su parque. No hay un `where` de cliente en esta
 * consulta a propósito: lo pone la RLS, que es la que no se puede olvidar.
 */
export default async function PaginaMiBox() {
  const sesion = await exigirSesion()

  /*
   * Un interno que llega aquí no tiene box propio. En vez de una lista vacía sin
   * explicación, se le manda a la pantalla que sí es suya.
   */
  if (sesion.perfil.rol !== 'cliente') {
    return (
      <div className="container max-w-2xl py-6">
        <EstadoVacio
          titulo="Esta pantalla es la del dueño de un box"
          descripcion="Tú ves todos los boxes desde la pantalla de boxes, con el parque completo y las visitas."
          accion={
            <Button asChild variant="outline">
              <Link href="/clientes">Ir a boxes</Link>
            </Button>
          }
        />
      </div>
    )
  }

  /*
   * Un cliente sin box asignado no ve nada, y aquí lo decimos con palabras en vez
   * de con una lista vacía. Es el estado en el que nace un usuario recién invitado:
   * existe, entra, y todavía no está atado a ningún cliente.
   */
  if (!sesion.perfil.cliente_id) {
    return (
      <div className="container max-w-2xl py-6">
        <EstadoVacio
          titulo="Tu usuario todavía no está asociado a ningún box"
          descripcion="Escríbenos y lo dejamos listo en un minuto. Hasta entonces no hay nada que enseñarte aquí."
        />
      </div>
    )
  }

  const supabase = createClient()

  const [{ data: parque }, { data: visitas }] = await Promise.all([
    supabase.from('parque_estado').select('*').order('nombre'),
    supabase
      .from('servicios')
      .select('id, fecha, estado')
      .eq('estado', 'hecho')
      .order('fecha', { ascending: false })
      .limit(1),
  ])

  const maquinas: MaquinaFila[] = (parque ?? []).map(comoMaquinaFila)
  const resumen = resumirParque(maquinas)
  const peor = peorSemaforo(maquinas.filter((m) => m.activa).map((m) => m.estado))
  const ultimaVisita = visitas?.[0] ?? null

  const box = sesion.cliente

  return (
    <div className="container max-w-3xl space-y-4 py-4 md:py-6">
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
          {ultimaVisita ? <span>Última visita: {formatearFecha(ultimaVisita.fecha)}</span> : null}
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
              Toca cualquiera para ver todo lo que se le ha hecho, con las fotos de cada servicio.
            </p>
            <ListaParque maquinas={maquinas} base="/mi-box/maquinas" />
          </section>
        </>
      )}
    </div>
  )
}
