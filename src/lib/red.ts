/**
 * Saber si hay red, y no esperar a un servidor que no está.
 *
 * Existe por lo que se midió en el arranque sin cobertura: la aplicación pedía el
 * perfil al servidor, supabase-js reintentaba tres veces con espera creciente y la
 * pantalla se quedaba en el esqueleto más de diez segundos antes de rendirse. Eso,
 * de pie delante de una máquina abierta, es la aplicación rota.
 *
 * Dos cosas, y las dos cortas: la señal que da el navegador, que resuelve el caso
 * normal (sin cobertura de verdad), y un límite de tiempo para el caso raro (portal
 * cautivo, red que existe pero no llega a ninguna parte).
 */

/** Lo que dice el navegador. No es infalible, pero es inmediato. */
export function hayRed(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine
}

/** Un error de tiempo agotado, para distinguirlo de un fallo del servidor. */
export class TiempoAgotado extends Error {
  constructor() {
    super('No ha respondido a tiempo')
    this.name = 'TiempoAgotado'
  }
}

/**
 * La promesa, o el error de tiempo agotado. Nunca las dos cosas.
 *
 * No cancela la petición: si llega tarde, se ignora. Cancelarla exigiría pasar un
 * `AbortSignal` por toda la cadena de supabase-js, y lo que hace falta aquí es solo
 * que la pantalla no se quede esperando.
 */
export function conTiempoLimite<T>(promesa: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolver, rechazar) => {
    const reloj = setTimeout(() => rechazar(new TiempoAgotado()), ms)
    // `PromiseLike` y no `Promise` porque las consultas de supabase-js son
    // «thenables» que todavía no han salido a la red cuando se construyen.
    Promise.resolve(promesa).then(
      (valor) => {
        clearTimeout(reloj)
        resolver(valor)
      },
      (error) => {
        clearTimeout(reloj)
        rechazar(error)
      },
    )
  })
}

/** Lo que se espera al servidor antes de tirar de lo guardado. */
export const ESPERA_MAXIMA_MS = 4000