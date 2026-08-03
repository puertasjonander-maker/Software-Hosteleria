'use client'

/**
 * Cola de solicitudes pendientes de sincronizar (MISE-001).
 *
 * Por qué localStorage y no la Background Sync API: Safari en iOS no la
 * implementa, y media plantilla usa iPhone. Una cola propia que se vacía al
 * recuperar red y al volver a la pestaña funciona en los dos sitios.
 *
 * Por qué la entrada guarda una cantidad ABSOLUTA y no un incremento: reenviar
 * "pon 3" dos veces deja 3; reenviar "+1" dos veces deja 4. Con red inestable,
 * el reenvío ocurre.
 */

const CLAVE = 'mise:cola-solicitudes:v1'

export type EntradaCola = {
  /** productId + locationId identifican la entrada: solo vive la última. */
  productId: string
  locationId: string
  qty: number
  note: string | null
  /** Momento del último cambio local, para no pisar algo más reciente. */
  actualizadoEn: number
}

type Cola = Record<string, EntradaCola>

function clave(productId: string, locationId: string) {
  return `${locationId}::${productId}`
}

function leer(): Cola {
  if (typeof window === 'undefined') return {}
  try {
    const bruto = window.localStorage.getItem(CLAVE)
    return bruto ? (JSON.parse(bruto) as Cola) : {}
  } catch {
    // Almacenamiento lleno, modo privado o JSON corrupto: la cola se pierde,
    // pero la app no se cae. Es una degradación aceptable.
    return {}
  }
}

function escribir(cola: Cola) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(cola))
  } catch {
    /* sin espacio: seguimos, la sincronización se intentará igual en memoria */
  }
}

export function encolar(entrada: Omit<EntradaCola, 'actualizadoEn'>): number {
  const cola = leer()
  cola[clave(entrada.productId, entrada.locationId)] = {
    ...entrada,
    actualizadoEn: Date.now(),
  }
  escribir(cola)
  return Object.keys(cola).length
}

export function pendientes(): EntradaCola[] {
  return Object.values(leer())
}

export function contarPendientes(): number {
  return Object.keys(leer()).length
}

/**
 * Quita una entrada solo si no ha cambiado desde que se envió. Si el usuario
 * volvió a tocar el stepper mientras la petición viajaba, la entrada nueva se
 * queda en la cola para el siguiente vaciado.
 */
export function confirmar(entrada: EntradaCola): void {
  const cola = leer()
  const k = clave(entrada.productId, entrada.locationId)
  if (cola[k] && cola[k].actualizadoEn <= entrada.actualizadoEn) {
    delete cola[k]
    escribir(cola)
  }
}

export function vaciar(): void {
  escribir({})
}
