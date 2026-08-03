import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { GestionUsuarios } from './gestion-usuarios'

export const metadata: Metadata = { title: 'Usuarios' }
export const dynamic = 'force-dynamic'

export default async function PaginaUsuarios() {
  const supabase = createClient()

  const [perfiles, locales] = await Promise.all([
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('locations').select('id, name').eq('active', true).order('name'),
  ])

  return (
    <GestionUsuarios
      usuarios={(perfiles.data ?? []).map((p) => ({
        id: p.id,
        nombre: p.full_name,
        rol: p.role,
        locationId: p.location_id,
        activo: p.active,
      }))}
      locales={(locales.data ?? []).map((l) => ({ id: l.id, nombre: l.name }))}
    />
  )
}
