import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { exigirRol } from '@/lib/auth'
import { peorSemaforo } from '@/lib/parque'
import type { Semaforo } from '@/lib/database.types'
import { EstadoError } from '@/components/ui/states'
import { GestionClientes, type BoxResumen } from './gestion-clientes'

export const metadata: Metadata = { title: 'Boxes' }

// El parque cambia desde la visita del compañero. Nada de caché de ruta.
export const dynamic = 'force-dynamic'

export default async function PaginaClientes() {
  const sesion = await exigirRol('admin', 'tecnico')
  const supabase = createClient()

  const [clientes, maquinas] = await Promise.all([
    supabase.from('clientes').select('*').order('nombre'),
    supabase.from('maquinas').select('cliente_id, estado, activa, proxima_revision'),
  ])

  if (clientes.error) {
    return (
      <div className="container max-w-4xl py-6">
        <EstadoError descripcion="No hemos podido cargar los boxes." />
      </div>
    )
  }

  const hoy = new Date().toISOString().slice(0, 10)

  const porBox = new Map<string, { estados: Semaforo[]; vencidas: number }>()
  for (const m of maquinas.data ?? []) {
    if (!m.activa) continue
    const actual = porBox.get(m.cliente_id) ?? { estados: [], vencidas: 0 }
    actual.estados.push(m.estado)
    if (m.proxima_revision && m.proxima_revision <= hoy) actual.vencidas += 1
    porBox.set(m.cliente_id, actual)
  }

  const boxes: BoxResumen[] = (clientes.data ?? []).map((c) => {
    const agregado = porBox.get(c.id) ?? { estados: [], vencidas: 0 }
    return {
      id: c.id,
      nombre: c.nombre,
      poblacion: c.poblacion,
      contactoNombre: c.contacto_nombre,
      activo: c.activo,
      maquinas: agregado.estados.length,
      peor: peorSemaforo(agregado.estados),
      vencidas: agregado.vencidas,
    }
  })

  return (
    <div className="container max-w-4xl space-y-4 py-4 md:py-6">
      <header className="hidden md:block">
        <h1 className="titulo-pantalla">Boxes</h1>
        <p className="mt-1 texto-meta">
          Cada box con su parque. El semáforo es el de su máquina peor, no un promedio.
        </p>
      </header>

      <GestionClientes boxes={boxes} puedeCrear={sesion.perfil.rol === 'admin'} />
    </div>
  )
}
