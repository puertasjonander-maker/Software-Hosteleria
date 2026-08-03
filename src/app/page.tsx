import { redirect } from 'next/navigation'
import { inicioSegunRol, obtenerSesion } from '@/lib/auth'

/**
 * La raíz no tiene contenido propio: cada rol entra directamente a su pantalla
 * (el barista a `/pedir`, el encargado a `/pedidos`, el operador al panel).
 * Un menú intermedio sería un toque de más para quien pide en mitad del turno.
 */
export default async function Inicio() {
  const sesion = await obtenerSesion()
  if (!sesion) redirect('/login')
  redirect(inicioSegunRol(sesion.profile.role))
}
