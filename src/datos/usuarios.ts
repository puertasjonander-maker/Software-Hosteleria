import { supabase } from '@/lib/supabase'
import { oReventar, resultado, traducir, type Resultado } from '@/datos/resultado'
import type { RolUsuario } from '@/lib/database.types'

/**
 * Usuarios y accesos (EBX-401).
 *
 * Casi todo va directo contra la base de datos: la política `perfiles_admin` ya
 * deja escribir el perfil de cualquiera solo a un administrador, así que no hay
 * nada que un intermediario pudiera comprobar mejor.
 *
 * Lo único que sale de aquí es crear un usuario y cambiarle la contraseña, porque
 * eso exige la clave de servicio. Vive en la función `alta-usuario`.
 */

export type UsuarioFila = {
  id: string
  nombre: string
  email: string | null
  rol: RolUsuario
  clienteId: string | null
  activo: boolean
  /** Null si no ha llegado a entrar nunca: la pista de que el acceso no le llegó. */
  ultimoAcceso: string | null
  invitadoEl: string | null
  /** Sigue con la contraseña temporal: todavía no ha elegido la suya. */
  contrasenaTemporal: boolean
  /** El usuario que está mirando la pantalla. No puede degradarse ni apagarse. */
  esTu: boolean
}

const ORDEN_ROL: Record<RolUsuario, number> = { admin: 0, tecnico: 1, cliente: 2 }

export async function listarUsuarios(miId: string): Promise<UsuarioFila[]> {
  const [perfiles, accesos] = await Promise.all([
    supabase
      .from('perfiles')
      .select('id, nombre, email, rol, cliente_id, activo, debe_cambiar_contrasena'),
    supabase.rpc('estado_accesos'),
  ])
  const filas = oReventar(perfiles)

  // Sin el dato de accesos (función aún no creada, o fallo suelto) la lista sigue
  // valiendo: solo se queda sin saber quién ha entrado.
  const porPerfil = new Map((accesos.data ?? []).map((a) => [a.perfil_id, a]))

  return filas
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      email: p.email,
      rol: p.rol,
      clienteId: p.cliente_id,
      activo: p.activo,
      ultimoAcceso: porPerfil.get(p.id)?.ultimo_acceso ?? null,
      invitadoEl: porPerfil.get(p.id)?.invitado_el ?? null,
      contrasenaTemporal: p.debe_cambiar_contrasena,
      esTu: p.id === miId,
    }))
    .sort((a, b) => {
      if (ORDEN_ROL[a.rol] !== ORDEN_ROL[b.rol]) return ORDEN_ROL[a.rol] - ORDEN_ROL[b.rol]
      return (a.nombre || a.email || '').localeCompare(b.nombre || b.email || '', 'es')
    })
}

/** Qué ha pasado con el correo de acceso. Lo decide la función, no el navegador. */
export type EstadoCorreo =
  | { estado: 'enviado' }
  | { estado: 'no_pedido' }
  | { estado: 'sin_configurar' }
  | { estado: 'fallo'; detalle: string }

export type Credencial = { email: string; contrasena: string; correo: EstadoCorreo }
export type ResultadoCredencial = { ok: true; credencial: Credencial } | { ok: false; mensaje: string }

/** Llama a la función de Supabase con el token de la sesión actual. */
async function llamarFuncion(cuerpo: Record<string, unknown>): Promise<ResultadoCredencial> {
  const { data, error } = await supabase.functions.invoke<{
    email?: string
    contrasena?: string
    correo?: EstadoCorreo
    error?: string
  }>('alta-usuario', { body: cuerpo })

  // `invoke` mete el cuerpo del error en `context`, no en el mensaje, así que sin
  // leerlo el usuario vería siempre "Edge Function returned a non-2xx status".
  if (error) {
    const detalle = await leerError(error)
    return { ok: false, mensaje: detalle ?? traducir(error.message) }
  }
  if (!data || data.error) return { ok: false, mensaje: data?.error ?? 'No ha funcionado.' }
  if (!data.contrasena) return { ok: false, mensaje: 'La función no ha devuelto contraseña.' }

  return {
    ok: true,
    credencial: {
      email: data.email ?? '',
      contrasena: data.contrasena,
      // Una función desplegada antes de que esto existiera no manda `correo`. Se
      // trata como «no se pidió», que es exactamente lo que hacía.
      correo: data.correo ?? { estado: 'no_pedido' },
    },
  }
}

async function leerError(error: unknown): Promise<string | null> {
  const contexto = (error as { context?: unknown })?.context
  if (!(contexto instanceof Response)) return null
  try {
    const cuerpo = await contexto.json()
    return typeof cuerpo?.error === 'string' ? cuerpo.error : null
  } catch {
    return null
  }
}

export type Invitacion = {
  /** Dueño de un box, o alguien del equipo de Ergobox. */
  rol: 'cliente' | 'tecnico'
  /** El box del que es dueño. Se ignora para un técnico, que no está atado a ninguno. */
  clienteId: string | null
  email: string
  nombre: string
  /**
   * Si se le manda el correo de acceso.
   *
   * Va explícito y por defecto no, en vez de darlo por hecho. Un correo no se
   * puede recuperar, así que mandarlo tiene que ser una decisión que alguien tomó
   * mirando los datos, no lo que pasa por no hacer nada.
   */
  enviarCorreo: boolean
}

/** Da de alta a alguien y, si se pide, le manda sus claves por correo. */
export function invitarUsuario(invitacion: Invitacion): Promise<ResultadoCredencial> {
  return llamarFuncion({ accion: 'crear', ...invitacion })
}

/**
 * Contraseña nueva. Se enseña una sola vez y no se guarda en ninguna parte.
 *
 * Con `enviarCorreo` es también «reenviar el acceso»: la contraseña de antes no
 * existe en ningún sitio que se pueda releer, así que reenviar es generar otra.
 */
export function restablecerContrasena(
  perfilId: string,
  enviarCorreo = false,
): Promise<ResultadoCredencial> {
  return llamarFuncion({ accion: 'restablecer', perfilId, enviarCorreo })
}

/**
 * El usuario elige su propia contraseña y deja de ser temporal.
 *
 * Primero la contraseña y después la marca: si falla lo primero, sigue obligado a
 * cambiarla (lo seguro); si falla lo segundo, la contraseña ya es suya y solo le
 * volverá a salir la pantalla una vez más.
 */
export async function elegirContrasena(userId: string, contrasena: string): Promise<Resultado> {
  const { error } = await supabase.auth.updateUser({ password: contrasena })
  if (error) {
    return {
      ok: false,
      mensaje: /same|different/i.test(error.message)
        ? 'Tiene que ser distinta de la que tienes ahora.'
        : /weak|short|least/i.test(error.message)
          ? 'Demasiado corta o fácil de adivinar. Prueba con una frase.'
          : traducir(error.message),
    }
  }
  const { error: errorMarca } = await supabase
    .from('perfiles')
    .update({ debe_cambiar_contrasena: false })
    .eq('id', userId)
  return resultado(errorMarca, 'tu usuario')
}

/** Cambia el box que alcanza un usuario. Null lo deja sin ver nada. */
export async function asignarBox(perfilId: string, clienteId: string | null): Promise<Resultado> {
  const { error } = await supabase
    .from('perfiles')
    .update({ cliente_id: clienteId })
    .eq('id', perfilId)
  return resultado(error, 'ese usuario')
}

/**
 * Cambia el rol de un usuario.
 *
 * Pasar a interno suelta el box: un técnico no está atado a ninguno, y dejarlo
 * puesto rompería la restricción `perfiles_cliente_coherente`. Al revés no se
 * hace solo — un interno que pasa a cliente se queda sin ver nada hasta que se le
 * asigne box, que es el estado seguro.
 *
 * El aviso de "no puedes quitarte a ti mismo la administración" es una barandilla
 * contra el despiste, no una medida de seguridad: quien la esquivara solo
 * conseguiría dejarse a sí mismo fuera.
 */
export async function cambiarRol(
  perfilId: string,
  rol: RolUsuario,
  miId: string,
): Promise<Resultado> {
  if (perfilId === miId && rol !== 'admin') {
    return { ok: false, mensaje: 'No puedes quitarte a ti mismo la administración.' }
  }

  const { error } = await supabase
    .from('perfiles')
    .update(rol === 'cliente' ? { rol } : { rol, cliente_id: null })
    .eq('id', perfilId)

  return resultado(error, 'ese usuario')
}

/**
 * Activa o desactiva un usuario.
 *
 * Desactivar no borra la cuenta: `auth_rol()` solo mira perfiles activos, así que
 * un usuario desactivado entra y no alcanza a nada. Es reversible, y borrarlo se
 * llevaría por delante la autoría de su histórico.
 */
export async function activarUsuario(
  perfilId: string,
  activo: boolean,
  miId: string,
): Promise<Resultado> {
  if (perfilId === miId && !activo) {
    return { ok: false, mensaje: 'No puedes desactivarte a ti mismo.' }
  }

  const { error } = await supabase.from('perfiles').update({ activo }).eq('id', perfilId)
  return resultado(error, 'ese usuario')
}
