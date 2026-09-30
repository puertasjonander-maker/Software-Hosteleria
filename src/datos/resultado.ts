/**
 * El resultado de una escritura, y la traducción de los errores de Postgres.
 *
 * Está en un sitio solo porque el mensaje que llega de la base de datos casi
 * nunca se puede enseñar. El de RLS es el ejemplo: cuando una política deniega
 * una escritura, lo que vuelve es "new row violates row-level security policy".
 * Es exacto y no le dice nada a quien lo lee.
 */

export type Resultado = { ok: true } | { ok: false; mensaje: string }
export type ResultadoCon<T> = { ok: true; valor: T } | { ok: false; mensaje: string }

export function traducir(mensaje: string, contexto = 'eso'): string {
  if (mensaje.includes('row-level security')) return 'Tu usuario no tiene permiso para esto.'
  if (mensaje.includes('duplicate key')) return `Ya existe ${contexto} con ese nombre.`
  if (mensaje.includes('cadencia_meses')) {
    return 'La cadencia tiene que estar entre 1 y 36 meses.'
  }
  if (mensaje.includes('no pertenece al box')) {
    return 'Esa máquina no es de este box. Recarga la pantalla.'
  }
  if (mensaje.includes('no es de esta máquina')) {
    return 'Ese parte no es de esta máquina. Recarga la pantalla.'
  }
  if (mensaje.includes('tiene que venir de un parte')) {
    return 'Un servicio se registra cerrando un parte, no anotándolo a mano.'
  }
  if (mensaje.includes('no es de un box que puedas tocar')) {
    return 'Esa máquina no es de un box al que llegues.'
  }
  if (mensaje.includes('perfiles_cliente_coherente')) {
    return 'Un interno no se ata a un box: los ve todos.'
  }
  if (mensaje.includes('Failed to fetch') || mensaje.includes('NetworkError')) {
    return 'Sin conexión con el servidor. Inténtalo de nuevo.'
  }
  return mensaje
}

/** Envuelve el error de una escritura de supabase-js en un `Resultado`. */
export function resultado(error: { message: string } | null, contexto = 'eso'): Resultado {
  return error ? { ok: false, mensaje: traducir(error.message, contexto) } : { ok: true }
}

/**
 * Convierte el error de una lectura en una excepción con mensaje legible.
 *
 * Las lecturas lanzan en vez de devolver un resultado porque quien las llama es
 * `useConsulta`, que ya tiene un sitio donde poner el error y una pantalla que lo
 * sabe enseñar.
 */
export function oReventar<T>({
  data,
  error,
}: {
  // `T` y no `T | null`: así se infiere de la respuesta entera, incluido su
  // `null`, y `NonNullable` lo quita al devolver. Con `T | null` en el parámetro,
  // TypeScript se queda con `never` y nada de lo que sale sirve.
  data: T
  error: { message: string } | null
}): NonNullable<T> {
  if (error) throw new Error(traducir(error.message))
  if (data === null || data === undefined) throw new Error('No hemos encontrado eso.')
  return data as NonNullable<T>
}
