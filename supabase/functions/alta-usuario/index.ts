// ─────────────────────────────────────────────────────────────────────────────
// Ergobox — alta y contraseña de usuarios (EBX-401)
//
// La única pieza de todo el producto que corre fuera del navegador, y existe por
// una sola razón: crear un usuario o cambiarle la contraseña exige la clave de
// servicio de Supabase, que se salta la seguridad entera. Esa clave no puede
// bajar al navegador bajo ningún concepto, así que vive aquí.
//
// Todo lo demás —listar usuarios, asignarles box, cambiarles el rol, activarlos—
// lo hace la aplicación directamente contra la base de datos, porque las
// políticas ya dejan hacerlo solo a un administrador.
//
// Quien llama manda su propio token. Lo primero que hace esta función es
// comprobar, contra la base de datos y no contra lo que diga la petición, que ese
// token es de un administrador activo. Sin eso, cualquiera con la dirección de la
// función podría crearse un usuario.
//
// Se despliega con:  supabase functions deploy alta-usuario
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { asuntoAcceso, htmlAcceso, textoAcceso, type DatosAcceso } from './correo.ts'

/*
 * `x-client-info` y `apikey` no son opcionales en esta lista.
 *
 * La librería de Supabase las manda siempre, y el navegador, antes del POST de
 * verdad, pregunta con un OPTIONS si están permitidas. Si una sola falta, corta
 * ahí y la petición real no llega a salir. Desde el navegador se ve como
 * «Failed to send a request to the Edge Function», que suena a que la función
 * está caída cuando en realidad ni se ha enterado: en los registros del proyecto
 * aparece el OPTIONS con un 200 y ningún POST detrás.
 */
const CABECERAS_CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ORIGEN_PERMITIDO') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function responder(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CABECERAS_CORS, 'Content-Type': 'application/json' },
  })
}

/** Qué ha pasado con el correo. La pantalla lo cuenta tal cual. */
type EstadoCorreo =
  | { estado: 'enviado' }
  | { estado: 'no_pedido' }
  | { estado: 'sin_configurar' }
  | { estado: 'fallo'; detalle: string }

/**
 * Manda el correo de acceso con Resend.
 *
 * El envío NUNCA puede tumbar el alta. El usuario ya está creado cuando se llega
 * aquí, y perder eso porque un servicio de correo esté caído sería cambiar un
 * problema pequeño —hay que dictar la contraseña por WhatsApp— por uno grande:
 * un usuario a medio crear. Por eso todo lo de aquí devuelve un estado en vez de
 * lanzar, y la pantalla enseña la contraseña igual pase lo que pase.
 *
 * Sin `RESEND_API_KEY` no se intenta nada y se dice que no está configurado, que
 * es distinto de que haya fallado.
 */
async function enviarAcceso(datos: DatosAcceso): Promise<EstadoCorreo> {
  const clave = Deno.env.get('RESEND_API_KEY')
  if (!clave) return { estado: 'sin_configurar' }

  const remitente = Deno.env.get('REMITENTE_CORREO') ?? 'Ergobox <hola@ergobox.es>'

  try {
    const respuesta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clave}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: remitente,
        to: [datos.email],
        // Quien recibe esto va a tener dudas, y la respuesta natural es darle a
        // «responder». Que llegue a un buzón que alguien lee.
        reply_to: 'hola@ergobox.es',
        subject: asuntoAcceso(datos),
        html: htmlAcceso(datos),
        text: textoAcceso(datos),
      }),
    })

    if (!respuesta.ok) {
      const cuerpo = await respuesta.text()
      return { estado: 'fallo', detalle: `${respuesta.status} · ${cuerpo.slice(0, 200)}` }
    }

    return { estado: 'enviado' }
  } catch (e) {
    return { estado: 'fallo', detalle: e instanceof Error ? e.message : String(e) }
  }
}

Deno.serve(async (peticion) => {
  if (peticion.method === 'OPTIONS') return new Response('ok', { headers: CABECERAS_CORS })
  if (peticion.method !== 'POST') return responder({ error: 'Método no permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const claveAnonima = Deno.env.get('SUPABASE_ANON_KEY')!
  const claveServicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const autorizacion = peticion.headers.get('Authorization') ?? ''
  if (!autorizacion.startsWith('Bearer ')) {
    return responder({ error: 'Falta la sesión.' }, 401)
  }

  // Cliente con el token de quien llama: sirve para saber quién es, y sus
  // consultas pasan por RLS igual que las de la aplicación.
  const comoUsuario = createClient(url, claveAnonima, {
    global: { headers: { Authorization: autorizacion } },
    auth: { persistSession: false },
  })

  const {
    data: { user },
  } = await comoUsuario.auth.getUser()
  if (!user) return responder({ error: 'Tu sesión ha caducado. Vuelve a entrar.' }, 401)

  const { data: perfil } = await comoUsuario
    .from('perfiles')
    .select('rol, activo')
    .eq('id', user.id)
    .maybeSingle()

  if (!perfil || perfil.rol !== 'admin' || !perfil.activo) {
    return responder({ error: 'Solo un administrador puede hacer esto.' }, 403)
  }

  let cuerpo: Record<string, unknown>
  try {
    cuerpo = await peticion.json()
  } catch {
    return responder({ error: 'Petición mal formada.' }, 400)
  }

  const admin = createClient(url, claveServicio, { auth: { persistSession: false } })
  const contrasena = generarContrasena()

  // ── Crear el usuario y atarlo a su box ─────────────────────────────────────
  if (cuerpo.accion === 'crear') {
    const email = String(cuerpo.email ?? '').trim().toLowerCase()
    const nombre = String(cuerpo.nombre ?? '').trim()
    // Solo estos dos. Un admin no se da de alta desde aquí: se asciende a mano a
    // alguien que ya existe, que es una decisión que merece dos pasos.
    const rol = cuerpo.rol === 'tecnico' ? 'tecnico' : 'cliente'
    const clienteId = rol === 'cliente' ? String(cuerpo.clienteId ?? '') : null
    const quiereCorreo = cuerpo.enviarCorreo === true

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return responder({ error: 'Ese correo no tiene buena pinta.' }, 400)
    }
    if (rol === 'cliente' && !clienteId) {
      return responder({ error: 'Elige a qué box se le da acceso.' }, 400)
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: contrasena,
      // Sin correo de confirmación: no hay SMTP y el alta la hace un humano que
      // ya sabe de quién es la dirección.
      email_confirm: true,
      user_metadata: { nombre },
    })

    if (error || !data.user) {
      const mensaje = error?.message ?? 'No se ha podido crear el usuario.'
      if (mensaje.toLowerCase().includes('already')) {
        return responder(
          { error: 'Ya existe un usuario con ese correo. Asígnale el box desde la lista.' },
          409,
        )
      }
      return responder({ error: mensaje }, 400)
    }

    // El perfil lo ha creado el trigger `handle_new_user`, siempre con rol
    // `cliente` y sin box. Lo único que se hace aquí es atarlo: nadie se da de
    // alta con permisos, ni siquiera pasando por esta función.
    // `cliente_id` va a null para un técnico, y no es opcional: la restricción
    // `perfiles_cliente_coherente` exige que un interno no esté atado a ningún box.
    const { error: errorPerfil } = await admin
      .from('perfiles')
      .update({ nombre, rol, cliente_id: clienteId, activo: true })
      .eq('id', data.user.id)

    if (errorPerfil) {
      return responder(
        { error: `Usuario creado, pero sin terminar de configurar: ${errorPerfil.message}` },
        500,
      )
    }

    // El nombre del box solo para el texto del correo. Si falla, el correo lo
    // dice de forma genérica en vez de no salir.
    let box: string | null = null
    if (clienteId) {
      const { data: fila } = await admin
        .from('clientes')
        .select('nombre')
        .eq('id', clienteId)
        .maybeSingle()
      box = fila?.nombre ?? null
    }

    const correo: EstadoCorreo = quiereCorreo
      ? await enviarAcceso({
          nombre,
          email,
          contrasena,
          box,
          url: Deno.env.get('URL_APP') ?? 'https://app.ergobox.es',
        })
      : { estado: 'no_pedido' }

    // La contraseña va en la respuesta pase lo que pase con el correo. Si el
    // envío ha fallado, la pantalla la enseña y se pasa por WhatsApp como antes.
    return responder({ email, contrasena, correo })
  }

  // ── Contraseña nueva para quien perdió la suya ─────────────────────────────
  if (cuerpo.accion === 'restablecer') {
    const perfilId = String(cuerpo.perfilId ?? '')
    if (!perfilId) return responder({ error: 'Falta el usuario.' }, 400)

    const { data, error } = await admin.auth.admin.updateUserById(perfilId, {
      password: contrasena,
    })

    if (error || !data.user) {
      return responder({ error: error?.message ?? 'No se ha podido cambiar la contraseña.' }, 400)
    }

    return responder({ email: data.user.email ?? '', contrasena })
  }

  return responder({ error: 'Acción desconocida.' }, 400)
})
