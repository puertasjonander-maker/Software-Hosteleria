import { supabase } from '@/lib/supabase'
import { configuracion } from '@/lib/configuracion'
import { resultado, traducir, type Resultado } from '@/datos/resultado'

/**
 * Avisos de próxima revisión, la parte que vive en el navegador (EBX-501).
 *
 * Activar los avisos es una escritura corriente contra `push_subscriptions`: su
 * política (`push_propio`) ya dice que cada usuario escribe las suyas y ninguna
 * otra, así que no hace falta ningún endpoint que lo intermedie.
 *
 * Lo único que sale de aquí es la prueba, porque enviar una notificación exige
 * las claves VAPID privadas y esas viven en la función `avisar-revisiones`.
 */

export type EstadoAvisos =
  /** El navegador no sabe de notificaciones, o no hay service worker. */
  | 'no_soportado'
  /** El permiso está denegado a nivel de navegador: no se puede pedir otra vez. */
  | 'bloqueado'
  | 'desactivado'
  | 'activado'

const CLAVE_PUBLICA = configuracion().vapidPublicKey

/**
 * La clave VAPID viaja en base64url y `pushManager` la quiere en bytes.
 *
 * El buffer se reserva a mano en vez de usar `Uint8Array.from`: desde TypeScript
 * 5.7 un `Uint8Array` puede estar respaldado por un `SharedArrayBuffer`, y
 * `BufferSource` no admite esos. Construyéndolo sobre un `ArrayBuffer` explícito
 * el tipo ya es el que la API pide.
 */
function base64UrlABytes(base64: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4)
  const normal = (base64 + relleno).replace(/-/g, '+').replace(/_/g, '/')
  const binario = atob(normal)

  const bytes = new Uint8Array(new ArrayBuffer(binario.length))
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i)
  return bytes
}

/**
 * `navigator.serviceWorker.ready` no resuelve nunca si el service worker no llegó
 * a activarse — un `sw.js` que devuelve 404, por ejemplo. Sin este tope, la
 * pantalla de ajustes se quedaría en "Comprobando…" para siempre y parecería que
 * la aplicación se ha colgado, cuando lo que pasa es justo lo contrario: que hay
 * algo que contar.
 */
async function servicioListo(): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolver) => setTimeout(() => resolver(null), 3000)),
  ])
}

function soportado(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(CLAVE_PUBLICA)
  )
}

export async function estadoAvisos(): Promise<EstadoAvisos> {
  if (!soportado()) return 'no_soportado'
  if (Notification.permission === 'denied') return 'bloqueado'
  if (Notification.permission !== 'granted') return 'desactivado'

  /*
   * Con permiso concedido todavía puede no haber suscripción: el permiso lo
   * recuerda el navegador para siempre y la suscripción se pierde al reinstalar
   * la aplicación o al limpiar los datos del sitio.
   */
  const registro = await servicioListo()
  if (!registro) return 'no_soportado'

  const suscripcion = await registro.pushManager.getSubscription()
  return suscripcion ? 'activado' : 'desactivado'
}

/**
 * Pide permiso, suscribe el navegador y guarda la suscripción.
 *
 * El `upsert` por endpoint es lo que hace que volver a activar en el mismo móvil
 * actualice sus claves en vez de dejar una fila muerta a la que el cron
 * reintentaría cada día.
 */
export async function activarAvisos(): Promise<Resultado> {
  if (!soportado()) {
    return { ok: false, mensaje: 'Este navegador no admite avisos, o falta la clave VAPID.' }
  }

  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') {
    return {
      ok: false,
      mensaje:
        permiso === 'denied'
          ? 'Has bloqueado las notificaciones. Se vuelven a permitir desde los ajustes del navegador.'
          : 'Sin permiso no se pueden enviar avisos.',
    }
  }

  const registro = await servicioListo()
  if (!registro) {
    return { ok: false, mensaje: 'El service worker no está activo. Recarga la página.' }
  }

  const suscripcion = await registro.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlABytes(CLAVE_PUBLICA),
  })

  const datos = suscripcion.toJSON()
  if (!datos.endpoint || !datos.keys?.p256dh || !datos.keys?.auth) {
    return { ok: false, mensaje: 'El navegador ha devuelto una suscripción incompleta.' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, mensaje: 'Tu sesión ha caducado. Vuelve a entrar.' }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      perfil_id: user.id,
      endpoint: datos.endpoint,
      p256dh: datos.keys.p256dh,
      auth: datos.keys.auth,
    },
    { onConflict: 'endpoint' },
  )

  return resultado(error, 'esa suscripción')
}

/**
 * Desactiva los avisos en este dispositivo.
 *
 * Se borra la fila primero y se cancela la suscripción después. Al revés, un
 * fallo a mitad dejaría en la base una dirección que ya no existe, y el cron le
 * escribiría todos los días hasta que alguien lo notara.
 */
export async function desactivarAvisos(): Promise<Resultado> {
  if (!soportado()) return { ok: true }

  const registro = await servicioListo()
  if (!registro) return { ok: true }

  const suscripcion = await registro.pushManager.getSubscription()
  if (!suscripcion) return { ok: true }

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', suscripcion.endpoint)

  if (error) return resultado(error, 'esa suscripción')

  await suscripcion.unsubscribe()
  return { ok: true }
}

/**
 * Manda una notificación de prueba a los dispositivos de quien lo pide.
 *
 * Es la única manera de comprobar el camino entero —claves VAPID, service worker,
 * permisos del móvil— sin esperar a que a una máquina le toque revisión.
 */
export async function enviarAvisoDePrueba(): Promise<Resultado> {
  const { data, error } = await supabase.functions.invoke<{ error?: string }>(
    'avisar-revisiones',
    { body: { prueba: true } },
  )

  if (error) {
    const contexto = (error as { context?: unknown }).context
    if (contexto instanceof Response) {
      try {
        const cuerpo = await contexto.json()
        if (typeof cuerpo?.error === 'string') return { ok: false, mensaje: cuerpo.error }
      } catch {
        /* se cae al mensaje genérico */
      }
    }
    return { ok: false, mensaje: traducir(error.message) }
  }

  if (data?.error) return { ok: false, mensaje: data.error }
  return { ok: true }
}
