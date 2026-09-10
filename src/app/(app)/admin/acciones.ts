'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { RolUsuario } from '@/lib/database.types'

/**
 * Administración de usuarios (EBX-401).
 *
 * Aquí es donde alguien pasa a ver los datos de un box, así que es el único
 * fichero del proyecto que usa la service role key. Cada acción vuelve a
 * comprobar que quien llama es admin: una acción de servidor es un endpoint
 * público con otro nombre, y la pantalla que la ofrece no la protege.
 */

export type Resultado = { ok: true } | { ok: false; mensaje: string }
export type ResultadoAlta = { ok: true; email: string; contrasena: string } | { ok: false; mensaje: string }

/** Comprueba el rol contra la base de datos, no contra lo que diga el cliente. */
async function exigirAdmin(): Promise<{ userId: string } | { mensaje: string }> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { mensaje: 'Tu sesión ha caducado. Vuelve a entrar.' }

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol, activo')
    .eq('id', user.id)
    .maybeSingle()

  if (!perfil || perfil.rol !== 'admin' || !perfil.activo) {
    return { mensaje: 'Solo un administrador puede hacer esto.' }
  }
  return { userId: user.id }
}

/**
 * Contraseña temporal legible en voz alta.
 *
 * Sin SMTP configurado no hay correo de invitación que mandar, y montar uno para
 * dar de alta a cuatro dueños de box al año es trabajo por nada. Se genera aquí,
 * se enseña una vez y se pasa por WhatsApp; el dueño la cambia cuando quiera.
 *
 * Sin caracteres ambiguos a propósito: dictar una `l` y una `I` por teléfono
 * acaba en una llamada de vuelta.
 */
const ALFABETO = 'abcdefghijkmnpqrstuvwxyz23456789'

function generarContrasena(longitud = 14): string {
  const bytes = new Uint8Array(longitud)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('')
}

/**
 * Da de alta al dueño de un box y lo ata a su cliente.
 *
 * El perfil lo crea el trigger `handle_new_user` al nacer el usuario, siempre con
 * rol `cliente` y sin box. Lo único que hace esta acción después es atarlo: nadie
 * se da de alta con permisos, ni siquiera pasando por aquí.
 */
export async function invitarDuenoBox(
  clienteId: string,
  email: string,
  nombre: string,
): Promise<ResultadoAlta> {
  const guardia = await exigirAdmin()
  if ('mensaje' in guardia) return { ok: false, mensaje: guardia.mensaje }

  const correo = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return { ok: false, mensaje: 'Ese correo no tiene buena pinta.' }
  }
  if (!clienteId) return { ok: false, mensaje: 'Elige a qué box se le da acceso.' }

  const admin = createAdminClient()
  const contrasena = generarContrasena()

  const { data, error } = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    // Sin correo de confirmación: no hay SMTP y el alta la hace un humano que ya
    // sabe de quién es la dirección.
    email_confirm: true,
    user_metadata: { nombre: nombre.trim() },
  })

  if (error || !data.user) {
    const mensaje = error?.message ?? 'No se ha podido crear el usuario.'
    if (mensaje.toLowerCase().includes('already')) {
      return { ok: false, mensaje: 'Ya existe un usuario con ese correo. Asígnale el box desde la lista.' }
    }
    return { ok: false, mensaje }
  }

  const { error: errorPerfil } = await admin
    .from('perfiles')
    .update({ nombre: nombre.trim(), rol: 'cliente', cliente_id: clienteId, activo: true })
    .eq('id', data.user.id)

  if (errorPerfil) {
    // El usuario existe pero no alcanza a nada: falla cerrado, que es como tiene
    // que fallar. Se dice claro para que se pueda arreglar desde la lista.
    return {
      ok: false,
      mensaje: `Usuario creado, pero no se ha podido asignar el box: ${errorPerfil.message}`,
    }
  }

  revalidatePath('/admin')
  return { ok: true, email: correo, contrasena }
}

/** Cambia el box que alcanza un usuario. Null lo deja sin ver nada. */
export async function asignarBox(perfilId: string, clienteId: string | null): Promise<Resultado> {
  const guardia = await exigirAdmin()
  if ('mensaje' in guardia) return { ok: false, mensaje: guardia.mensaje }

  const admin = createAdminClient()

  // La restricción `perfiles_cliente_coherente` no deja atar un box a un interno.
  // Se dice aquí con palabras en vez de dejar que salte el check.
  if (clienteId) {
    const { data: perfil } = await admin.from('perfiles').select('rol').eq('id', perfilId).maybeSingle()
    if (perfil && perfil.rol !== 'cliente') {
      return { ok: false, mensaje: 'Un interno no se ata a un box: ve todos.' }
    }
  }

  const { error } = await admin.from('perfiles').update({ cliente_id: clienteId }).eq('id', perfilId)

  revalidatePath('/admin')
  return error ? { ok: false, mensaje: error.message } : { ok: true }
}

/**
 * Cambia el rol de un usuario.
 *
 * Pasar a interno suelta el box: un técnico no está atado a ninguno, y dejarlo
 * puesto rompería la restricción de coherencia. Al revés no se hace solo — un
 * interno que pasa a cliente se queda sin ver nada hasta que se le asigne box,
 * que es el estado seguro.
 */
export async function cambiarRol(perfilId: string, rol: RolUsuario): Promise<Resultado> {
  const guardia = await exigirAdmin()
  if ('mensaje' in guardia) return { ok: false, mensaje: guardia.mensaje }

  if (perfilId === guardia.userId && rol !== 'admin') {
    return { ok: false, mensaje: 'No puedes quitarte a ti mismo la administración.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('perfiles')
    .update(rol === 'cliente' ? { rol } : { rol, cliente_id: null })
    .eq('id', perfilId)

  revalidatePath('/admin')
  return error ? { ok: false, mensaje: error.message } : { ok: true }
}

/**
 * Activa o desactiva un usuario.
 *
 * Desactivar no borra la cuenta: `auth_rol()` solo mira perfiles activos, así que
 * un usuario desactivado entra y no alcanza a nada. Es reversible, y borrarlo se
 * llevaría por delante la autoría de su histórico.
 */
export async function activarUsuario(perfilId: string, activo: boolean): Promise<Resultado> {
  const guardia = await exigirAdmin()
  if ('mensaje' in guardia) return { ok: false, mensaje: guardia.mensaje }

  if (perfilId === guardia.userId && !activo) {
    return { ok: false, mensaje: 'No puedes desactivarte a ti mismo.' }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('perfiles').update({ activo }).eq('id', perfilId)

  revalidatePath('/admin')
  return error ? { ok: false, mensaje: error.message } : { ok: true }
}

/** Nueva contraseña temporal para quien perdió la suya. Se enseña una sola vez. */
export async function restablecerContrasena(perfilId: string): Promise<ResultadoAlta> {
  const guardia = await exigirAdmin()
  if ('mensaje' in guardia) return { ok: false, mensaje: guardia.mensaje }

  const admin = createAdminClient()
  const contrasena = generarContrasena()

  const { data, error } = await admin.auth.admin.updateUserById(perfilId, { password: contrasena })
  if (error || !data.user) {
    return { ok: false, mensaje: error?.message ?? 'No se ha podido cambiar la contraseña.' }
  }

  return { ok: true, email: data.user.email ?? '', contrasena }
}
