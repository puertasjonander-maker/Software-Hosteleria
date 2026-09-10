import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { exigirRol } from '@/lib/auth'
import { EstadoError } from '@/components/ui/states'
import { ListaVisitas, type BoxParaPlanificar, type VisitaFila } from './lista-visitas'

export const metadata: Metadata = { title: 'Visitas' }

export const dynamic = 'force-dynamic'

export default async function PaginaVisitas() {
  await exigirRol('admin', 'tecnico')
  const supabase = createClient()

  const [servicios, partes, clientes, parque] = await Promise.all([
    supabase.from('servicios').select('*').neq('estado', 'cancelado').order('fecha', {
      ascending: false,
    }),
    supabase.from('partes').select('servicio_id, hecho'),
    supabase.from('clientes').select('id, nombre, poblacion').eq('activo', true).order('nombre'),
    supabase
      .from('parque_estado')
      .select('id, cliente_id, nombre, tipo, estado, dias_hasta_revision, activa')
      .order('nombre'),
  ])

  if (servicios.error) {
    return (
      <div className="container max-w-3xl py-6">
        <EstadoError descripcion="No hemos podido cargar las visitas." />
      </div>
    )
  }

  const nombrePorBox = new Map((clientes.data ?? []).map((c) => [c.id, c.nombre]))

  const conteo = new Map<string, { total: number; hechos: number }>()
  for (const p of partes.data ?? []) {
    const actual = conteo.get(p.servicio_id) ?? { total: 0, hechos: 0 }
    actual.total += 1
    if (p.hecho) actual.hechos += 1
    conteo.set(p.servicio_id, actual)
  }

  const visitas: VisitaFila[] = (servicios.data ?? []).map((s) => {
    const c = conteo.get(s.id) ?? { total: 0, hechos: 0 }
    return {
      id: s.id,
      clienteId: s.cliente_id,
      clienteNombre: nombrePorBox.get(s.cliente_id) ?? 'Box desconocido',
      fecha: s.fecha,
      estado: s.estado,
      maquinas: c.total,
      hechas: c.hechos,
    }
  })

  const boxes: BoxParaPlanificar[] = (clientes.data ?? []).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    poblacion: c.poblacion,
    maquinas: (parque.data ?? [])
      .filter((m) => m.cliente_id === c.id && m.activa)
      .map((m) => ({
        id: m.id,
        nombre: m.nombre,
        tipo: m.tipo,
        estado: m.estado,
        diasHastaRevision: m.dias_hasta_revision,
      })),
  }))

  return (
    <div className="container max-w-3xl space-y-4 py-4 md:py-6">
      <header className="hidden md:block">
        <h1 className="titulo-pantalla">Visitas</h1>
        <p className="mt-1 texto-meta">
          El trabajo de un día en un box. Se planifica con cobertura y se ejecuta sin ella.
        </p>
      </header>

      <ListaVisitas visitas={visitas} boxes={boxes} />
    </div>
  )
}
