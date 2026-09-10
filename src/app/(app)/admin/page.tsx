import type { Metadata } from 'next'
import { exigirRol } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { EstadoError } from '@/components/ui/states'
import { GestionUsuarios, type UsuarioFila } from './gestion-usuarios'

export const metadata: Metadata = { title: 'Administración' }
export const dynamic = 'force-dynamic'

/**
 * Usuarios y accesos (EBX-401).
 *
 * La única pantalla desde la que alguien pasa a ver los datos de un box, y por
 * eso la única que lee `auth.users` con la service role: el correo de un usuario
 * no está en `perfiles` y PostgREST no expone el esquema `auth`. La sesión ya se
 * ha comprobado arriba antes de tocar esa key.
 */
export default async function PaginaAdmin() {
  const sesion = await exigirRol('admin')
  const supabase = createClient()

  const [{ data: perfiles }, { data: clientes }] = await Promise.all([
    supabase.from('perfiles').select('id, nombre, rol, cliente_id, activo, created_at'),
    supabase.from('clientes').select('id, nombre').order('nombre'),
  ])

  let correos = new Map<string, string>()
  let fallaAuth = false

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    if (error) fallaAuth = true
    else correos = new Map(data.users.map((u) => [u.id, u.email ?? '']))
  } catch {
    // Falta la service role key en el entorno. La pantalla sigue siendo útil sin
    // los correos, así que se avisa y se pinta el resto.
    fallaAuth = true
  }

  const usuarios: UsuarioFila[] = (perfiles ?? [])
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      email: correos.get(p.id) ?? null,
      rol: p.rol,
      clienteId: p.cliente_id,
      activo: p.activo,
      creado: p.created_at,
      esTu: p.id === sesion.userId,
    }))
    .sort((a, b) => {
      const orden = { admin: 0, tecnico: 1, cliente: 2 }
      if (orden[a.rol] !== orden[b.rol]) return orden[a.rol] - orden[b.rol]
      return (a.nombre || a.email || '').localeCompare(b.nombre || b.email || '', 'es')
    })

  return (
    <div className="container max-w-4xl space-y-4 py-4 md:py-6">
      <header className="space-y-1">
        <h1 className="titulo-pantalla">Administración</h1>
        <p className="texto-meta">
          Quién entra y qué alcanza. Un cliente solo ve su box, y solo lo ve si aquí se lo has
          asignado.
        </p>
      </header>

      {fallaAuth ? (
        <EstadoError
          titulo="No hemos podido leer los correos"
          descripcion="Falta SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor. Los usuarios se ven igual, pero no se pueden dar de alta desde aquí."
        />
      ) : null}

      <GestionUsuarios usuarios={usuarios} boxes={clientes ?? []} />
    </div>
  )
}
