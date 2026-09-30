/**
 * De dónde saca la aplicación a qué Supabase conectarse.
 *
 * De un `config.json` que se sirve junto a ella, y no de variables cocidas en el
 * build. La diferencia importa por cómo se publica esto: los ficheros se suben a
 * un hosting por FTP, así que con las claves dentro del paquete, cambiar una
 * obligaría a reinstalar Node, reconstruir y volver a subirlo todo. Con un
 * fichero aparte, se edita un fichero de cuatro líneas en el servidor.
 *
 * En desarrollo no hace falta: si no hay `config.json`, se usan las variables de
 * `.env.local`, que es lo cómodo con el servidor de Vite delante.
 */

export type Configuracion = {
  supabaseUrl: string
  supabaseAnonKey: string
  /** Opcional: sin ella, los avisos de revisión salen como no disponibles. */
  vapidPublicKey: string
}

let actual: Configuracion | null = null

/** La configuración ya cargada. Revienta si se pide antes de tiempo, que sería un error de arranque. */
export function configuracion(): Configuracion {
  if (!actual) throw new Error('La configuración se pide antes de cargarla')
  return actual
}

function valida(c: Partial<Configuracion> | null): c is Configuracion {
  if (!c) return false
  if (typeof c.supabaseUrl !== 'string' || !c.supabaseUrl.startsWith('https://')) return false
  if (typeof c.supabaseAnonKey !== 'string' || c.supabaseAnonKey.length < 20) return false
  return true
}

/**
 * Busca la configuración, primero en `config.json` y después en el entorno del
 * build. Devuelve null si no hay ninguna utilizable, y entonces la aplicación
 * enseña qué falta en vez de una pantalla en blanco.
 */
export async function cargarConfiguracion(): Promise<Configuracion | null> {
  try {
    // `no-store`: un fichero de configuración cacheado por el navegador es una
    // llave vieja que sigue abriendo una puerta que ya se cambió.
    const respuesta = await fetch('/config.json', { cache: 'no-store' })
    if (respuesta.ok) {
      const leido = (await respuesta.json()) as Partial<Configuracion>
      if (valida(leido)) {
        // La clave VAPID es opcional, así que se normaliza a cadena vacía en vez
        // de dejar un `undefined` suelto que luego hay que comprobar en dos sitios.
        actual = { ...leido, vapidPublicKey: leido.vapidPublicKey ?? '' }
        return actual
      }
    }
  } catch {
    // Sin fichero, o con JSON roto. Se prueba con el entorno.
  }

  const delEntorno: Partial<Configuracion> = {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '',
  }

  if (valida(delEntorno)) {
    actual = delEntorno
    return actual
  }

  return null
}
