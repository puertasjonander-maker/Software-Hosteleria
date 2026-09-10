import { redirect } from 'next/navigation'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { ClienteRow, PerfilRow, RolUsuario } from '@/lib/database.types'

export type Sesion = {
  userId: string
  email: string | null
  perfil: PerfilRow
  /** El box del usuario. Siempre null para un interno: un técnico no está atado a uno. */
  cliente: ClienteRow | null
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

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (!perfil) return null

  let cliente: ClienteRow | null = null
  if (perfil.cliente_id) {
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', perfil.cliente_id)
      .maybeSingle()
    cliente = data ?? null
  }

  return { userId: user.id, email: user.email ?? null, perfil, cliente }
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
  if (!roles.includes(sesion.perfil.rol)) redirect('/sin-permiso')
  return sesion
}

/**
 * Exige que el usuario alcance este box. Espejo de `alcanza_cliente()` en SQL.
 *
 * Que exista aquí no lo convierte en la defensa: si esta comprobación fallara, la
 * consulta seguiría devolviendo cero filas por RLS. Sirve para dar un 403 legible
 * en vez de una pantalla vacía sin explicación.
 */
export async function exigirCliente(clienteId: string): Promise<Sesion> {
  const sesion = await exigirSesion()
  const { rol, cliente_id } = sesion.perfil
  const alcanza = rol === 'admin' || rol === 'tecnico' || cliente_id === clienteId
  if (!alcanza) redirect('/sin-permiso')
  return sesion
}

// Los helpers de rol viven en `lib/roles.ts` para que los pueda importar también
// un componente de cliente. Se reexportan aquí por comodidad del lado servidor.
export { ETIQUETA_ROL, esInterno, inicioSegunRol } from '@/lib/roles'
