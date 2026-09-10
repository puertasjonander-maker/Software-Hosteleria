import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { exigirRol } from '@/lib/auth'
import { ImportadorParque } from './importador'

export const metadata: Metadata = { title: 'Importar parque' }

export const dynamic = 'force-dynamic'

export default async function PaginaImportar({ params }: { params: { id: string } }) {
  await exigirRol('admin', 'tecnico')
  const supabase = createClient()

  const { data: cliente } = await supabase
    .from('clientes')
    .select('id, nombre')
    .eq('id', params.id)
    .maybeSingle()

  if (!cliente) notFound()

  const { count } = await supabase
    .from('maquinas')
    .select('id', { count: 'exact', head: true })
    .eq('cliente_id', params.id)

  return (
    <div className="container max-w-3xl space-y-4 py-4 md:py-6">
      <header className="hidden md:block">
        <h1 className="titulo-pantalla">Importar parque</h1>
        <p className="mt-1 texto-meta">{cliente.nombre}</p>
      </header>

      <ImportadorParque
        clienteId={cliente.id}
        clienteNombre={cliente.nombre}
        maquinasActuales={count ?? 0}
      />
    </div>
  )
}
