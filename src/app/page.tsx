import { redirect } from 'next/navigation'
import { inicioSegunRol, obtenerSesion } from '@/lib/auth'

/**
 * La raíz no tiene contenido propio: cada rol entra directamente a su pantalla.
 * El técnico y el administrador a las visitas, el dueño de un box a su box. Un
 * menú intermedio sería un toque de más para quien abre la app dentro del local.
 */
export default async function Inicio() {
  const sesion = await obtenerSesion()
  if (!sesion) redirect('/login')
  redirect(inicioSegunRol(sesion.perfil.rol))
}
