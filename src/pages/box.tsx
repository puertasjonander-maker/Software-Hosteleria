import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MapPin, Phone, Plus, Upload } from 'lucide-react'
import { useConsulta } from '@/lib/consulta'
import { useSesionActiva } from '@/lib/sesion'
import { obtenerBox } from '@/datos/boxes'
import { parqueDeBox } from '@/datos/parque'
import { peorSemaforo, resumirParque } from '@/lib/parque'
import { Button } from '@/components/ui/button'
import { Skeleton, SkeletonLista } from '@/components/ui/skeleton'
import { EstadoVacio } from '@/components/ui/states'
import { ChipSemaforo } from '@/components/chip-semaforo'
import { Cargador, useTitulo } from '@/components/cargador'
import { FichaBox } from '@/components/ficha-box'
import { FormularioMaquina } from '@/components/formulario-maquina'
import { ListaParque } from '@/components/lista-parque'
import { ResumenParque } from '@/components/resumen-parque'

export default function Box() {
  const { id = '' } = useParams()
  const sesion = useSesionActiva()
  const [creando, setCreando] = useState(false)

  const consulta = useConsulta(
    async () => {
      const [box, maquinas] = await Promise.all([obtenerBox(id), parqueDeBox(id)])
      return { box, maquinas }
    },
    [id],
  )

  useTitulo(consulta.datos?.box.nombre ?? 'Box')

  return (
    <div className="container max-w-4xl space-y-4 py-4 md:py-6">
      <Cargador
        consulta={consulta}
        esqueleto={
          <div className="space-y-4">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-9 w-40" />
            <SkeletonLista filas={6} />
          </div>
        }
      >
        {({ box, maquinas }) => {
          const resumen = resumirParque(maquinas)
          const peor = peorSemaforo(maquinas.filter((m) => m.activa).map((m) => m.estado))

          return (
            <>
              <header className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="titulo-pantalla">{box.nombre}</h1>
                  {peor ? <ChipSemaforo estado={peor} /> : null}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 texto-meta">
                  {box.direccion || box.poblacion ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {[box.direccion, box.poblacion].filter(Boolean).join(', ')}
                    </span>
                  ) : null}
                  {box.contacto_telefono ? (
                    <a
                      href={`tel:${box.contacto_telefono.replace(/\s/g, '')}`}
                      className="inline-flex items-center gap-1.5 hover:text-foreground"
                    >
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      {box.contacto_nombre
                        ? `${box.contacto_nombre} · ${box.contacto_telefono}`
                        : box.contacto_telefono}
                    </a>
                  ) : null}
                </div>

                {box.notas ? <p className="texto-meta">{box.notas}</p> : null}
              </header>

              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" className="sm:h-9 sm:px-3">
                  <Link to={`/boxes/${id}/importar`}>
                    <Upload /> Importar parque
                  </Link>
                </Button>

                {sesion.perfil.rol === 'admin' ? (
                  <FichaBox
                    box={{
                      id: box.id,
                      nombre: box.nombre,
                      direccion: box.direccion,
                      poblacion: box.poblacion,
                      contactoNombre: box.contacto_nombre,
                      contactoTelefono: box.contacto_telefono,
                      contactoEmail: box.contacto_email,
                      notas: box.notas,
                      activo: box.activo,
                    }}
                    onCambio={consulta.recargar}
                  />
                ) : null}
              </div>

              <ResumenParque resumen={resumen} />

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="titulo-seccion">Parque</h2>
                  <Button size="sm" variant="outline" onClick={() => setCreando(true)}>
                    <Plus /> Añadir máquina
                  </Button>
                </div>

                {maquinas.length === 0 ? (
                  <EstadoVacio
                    titulo="Este box todavía no tiene parque"
                    descripcion="Añade las máquinas una a una, o importa de golpe la hoja que rellenaste en la visita."
                  />
                ) : (
                  <ListaParque maquinas={maquinas} base={`/boxes/${id}/maquinas`} />
                )}
              </div>

              <FormularioMaquina
                abierto={creando}
                onCerrar={() => setCreando(false)}
                clienteId={id}
                maquina={null}
                onCambio={consulta.recargar}
              />
            </>
          )
        }}
      </Cargador>
    </div>
  )
}
