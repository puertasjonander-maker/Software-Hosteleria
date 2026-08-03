import { redirect } from 'next/navigation'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { LocationRow, ProfileRow, RolUsuario } from '@/lib/database.types'

export type Sesion = {
  userId: string
  email: string | null
  profile: ProfileRow
  location: LocationRow | null
}

/**
 * Sesión y perfil del usuario actual.
 *
 * `cache()` de React lo memoriza por petición: un layout y tres componentes
 * pueden pedirlo sin provocar cuatro viajes a Supabase.
 */
export const obtenerSesion = cache(async (): Promise<Sesion | null> => {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) return null

  let location: LocationRow | null = null
  if (profile.location_id) {
    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('id', profile.location_id)
      .maybeSingle()
    location = data ?? null
  }

  return { userId: user.id, email: user.email ?? null, profile, location }
})

/** Exige sesión. Si no la hay, al login (el middleware ya suele haberlo hecho). */
export async function exigirSesion(): Promise<Sesion> {
  const sesion = await obtenerSesion()
  if (!sesion) redirect('/login')
  return sesion
}

/**
 * Exige un rol concreto. Es una segunda barrera, no la principal: la que de
 * verdad protege los datos es la RLS. Esto solo evita enseñar una pantalla que
 * luego saldría vacía.
 */
export async function exigirRol(...roles: RolUsuario[]): Promise<Sesion> {
  const sesion = await exigirSesion()
  if (!roles.includes(sesion.profile.role)) redirect('/sin-permiso')
  return sesion
}

// Los helpers de rol viven en `lib/roles.ts` para que los pueda importar también
// un componente de cliente. Se reexportan aquí por comodidad del lado servidor.
export { ETIQUETA_ROL, esGestor, inicioSegunRol } from '@/lib/roles'
