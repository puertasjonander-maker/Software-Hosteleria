import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapPin, Phone, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { exigirRol } from '@/lib/auth'
import { peorSemaforo } from '@/lib/parque'
import { plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { EstadoError } from '@/components/ui/states'
import { ChipSemaforo } from '@/components/chip-semaforo'
import { FichaBox } from './ficha-box'
import { Parque, type MaquinaFila } from './parque'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { id: string }
}): Promise<Metadata> {
  const supabase = createClient()
  const { data } = await supabase.from('clientes').select('nombre').eq('id', params.id).maybeSingle()
  return { title: data?.nombre ?? 'Box' }
}

export default async function PaginaBox({ params }: { params: { id: string } }) {
  const sesion = await exigirRol('admin', 'tecnico')
  const supabase = createClient()

  const { data: cliente, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (error) {
    return (
      <div className="container max-w-4xl py-6">
        <EstadoError descripcion="No hemos podido cargar este box." />
      </div>
    )
  }
  if (!cliente) notFound()

  const { data: parque } = await supabase
    .from('parque_estado')
    .select('*')
    .eq('cliente_id', params.id)
    .order('nombre')

  const maquinas: MaquinaFila[] = (parque ?? []).map((m) => ({
    id: m.id,
    nombre: m.nombre,
    tipo: m.tipo,
    marca: m.marca,
    modelo: m.modelo,
    numSerie: m.num_serie,
    ubicacion: m.ubicacion,
    notas: m.notas,
    estado: m.estado,
    cadenciaMeses: m.cadencia_meses,
    ultimaRevision: m.ultima_revision,
    proximaRevision: m.proxima_revision,
    diasHastaRevision: m.dias_hasta_revision,
    serviciosHechos: m.servicios_hechos,
    activa: m.activa,
  }))

  const activas = maquinas.filter((m) => m.activa)
  const peor = peorSemaforo(activas.map((m) => m.estado))

  return (
    <div className="container max-w-4xl space-y-4 py-4 md:py-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="titulo-pantalla">{cliente.nombre}</h1>
          {peor ? <ChipSemaforo estado={peor} /> : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 texto-meta">
          {cliente.direccion || cliente.poblacion ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {[cliente.direccion, cliente.poblacion].filter(Boolean).join(', ')}
            </span>
          ) : null}
          {cliente.contacto_telefono ? (
            <a
              href={`tel:${cliente.contacto_telefono.replace(/\s/g, '')}`}
              className="inline-flex items-center gap-1.5 hover:text-foreground"
            >
              <Phone className="h-3.5 w-3.5 shrink-0" />
              {cliente.contacto_nombre
                ? `${cliente.contacto_nombre} · ${cliente.contacto_telefono}`
                : cliente.contacto_telefono}
            </a>
          ) : null}
          <span>
            {activas.length > 0
              ? `${activas.length} ${plural(activas.length, 'máquina', 'máquinas')}`
              : 'sin parque'}
          </span>
        </div>

        {cliente.notas ? <p className="texto-meta">{cliente.notas}</p> : null}
      </header>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" className="sm:h-9 sm:px-3">
          <Link href={`/clientes/${params.id}/importar`}>
            <Upload /> Importar parque
          </Link>
        </Button>

        {sesion.perfil.rol === 'admin' ? (
          <FichaBox
            box={{
              id: cliente.id,
              nombre: cliente.nombre,
              direccion: cliente.direccion,
              poblacion: cliente.poblacion,
              contactoNombre: cliente.contacto_nombre,
              contactoTelefono: cliente.contacto_telefono,
              contactoEmail: cliente.contacto_email,
              notas: cliente.notas,
              activo: cliente.activo,
            }}
          />
        ) : null}
      </div>

      <Parque clienteId={params.id} maquinas={maquinas} />
    </div>
  )
}
