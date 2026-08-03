import type { UnidadBase } from '@/lib/database.types'

/**
 * Normalización de unidades del escandallo.
 *
 * MISE-008 exige que la conversión sea explícita y no adivinada. Aquí solo se
 * resuelve lo que es aritmética pura y sin ambigüedad (gramos a kilos,
 * mililitros a litros). Lo que NO se resuelve aquí es el salto de unidad de
 * compra a unidad base — "un saco" no son 25 kg porque sí — porque ese factor
 * es un dato del producto (`units_per_order_unit`), no una suposición del
 * importador.
 */

const EQUIVALENCIAS: Record<string, { unidad: UnidadBase; factor: number }> = {
  // Masa
  kg: { unidad: 'kg', factor: 1 },
  kilo: { unidad: 'kg', factor: 1 },
  kilos: { unidad: 'kg', factor: 1 },
  kgs: { unidad: 'kg', factor: 1 },
  g: { unidad: 'kg', factor: 0.001 },
  gr: { unidad: 'kg', factor: 0.001 },
  grs: { unidad: 'kg', factor: 0.001 },
  gramo: { unidad: 'kg', factor: 0.001 },
  gramos: { unidad: 'kg', factor: 0.001 },

  // Volumen
  l: { unidad: 'l', factor: 1 },
  lt: { unidad: 'l', factor: 1 },
  litro: { unidad: 'l', factor: 1 },
  litros: { unidad: 'l', factor: 1 },
  ml: { unidad: 'l', factor: 0.001 },
  cl: { unidad: 'l', factor: 0.01 },
  dl: { unidad: 'l', factor: 0.1 },

  // Cuenta
  ud: { unidad: 'ud', factor: 1 },
  uds: { unidad: 'ud', factor: 1 },
  u: { unidad: 'ud', factor: 1 },
  unidad: { unidad: 'ud', factor: 1 },
  unidades: { unidad: 'ud', factor: 1 },
  pieza: { unidad: 'ud', factor: 1 },
  piezas: { unidad: 'ud', factor: 1 },
  rebanada: { unidad: 'ud', factor: 1 },
  rebanadas: { unidad: 'ud', factor: 1 },
}

export type UnidadResuelta = {
  unidad: UnidadBase
  factor: number
  /** Texto original: si no se reconoce, la fila se marca y no se descarta. */
  original: string
  reconocida: boolean
}

export function resolverUnidad(texto: string | null | undefined): UnidadResuelta {
  const original = (texto ?? '').trim()
  const clave = original
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.\s]/g, '')

  const encontrada = EQUIVALENCIAS[clave]
  if (encontrada) {
    return { ...encontrada, original, reconocida: true }
  }

  // Sin unidad reconocible se asume "ud" y se avisa: es preferible importar la
  // línea marcada a perderla (MISE-008: la importación parcial es válida).
  return { unidad: 'ud', factor: 1, original, reconocida: false }
}

/**
 * Lee un número tal y como lo escribe una hoja de cálculo española: "1.234,5"
 * y "1,5" son válidos, y "0,018" no debe convertirse en 18.
 */
export function leerNumero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  if (valor === null || valor === undefined) return null

  const texto = String(valor).trim()
  if (texto === '') return null

  const tieneComa = texto.includes(',')
  const tienePunto = texto.includes('.')

  let normalizado = texto.replace(/[^\d.,-]/g, '')

  if (tieneComa && tienePunto) {
    // El separador decimal es el que aparece más a la derecha.
    normalizado =
      normalizado.lastIndexOf(',') > normalizado.lastIndexOf('.')
        ? normalizado.replace(/\./g, '').replace(',', '.')
        : normalizado.replace(/,/g, '')
  } else if (tieneComa) {
    normalizado = normalizado.replace(',', '.')
  }

  const numero = Number(normalizado)
  return Number.isFinite(numero) ? numero : null
}

/** Un porcentaje de merma escrito como "20", "20%" o "0,2". */
export function leerMerma(valor: unknown): number {
  const numero = leerNumero(valor)
  if (numero === null || numero <= 0) return 0
  // Alguien escribe 0,2 queriendo decir 20 %. Por encima de 1 se lee literal.
  const pct = numero <= 1 ? numero * 100 : numero
  // El esquema no admite 100 % o más: sería dividir por cero al calcular coste.
  return Math.min(Math.max(pct, 0), 99)
}

/** Umbrales del emparejado automático por similitud de nombre (MISE-008). */
export const SIMILITUD_AUTOMATICA = 0.55
export const SIMILITUD_AMBIGUA = 0.3

export type FilaEscandallo = {
  elaboracion: string
  ingrediente: string
  cantidad: number
  unidad: UnidadBase
  mermaPct: number
  raciones: number
  unidadRacion: string
  pvp: number | null
  unidadOriginal: string
  unidadReconocida: boolean
}

export type ColumnasEscandallo = {
  elaboracion: string
  ingrediente: string
  cantidad: string
  unidad: string
  merma?: string
  raciones?: string
  unidadRacion?: string
  pvp?: string
}

/**
 * Convierte las filas crudas del fichero en filas de escandallo, usando el mapeo
 * de columnas que ha hecho la persona en pantalla. El importador no asume nunca
 * la estructura del Excel: solo sabe lo que le han dicho.
 */
export function interpretarFilas(
  filas: Record<string, unknown>[],
  columnas: ColumnasEscandallo,
): { validas: FilaEscandallo[]; descartadas: { fila: number; motivo: string }[] } {
  const validas: FilaEscandallo[] = []
  const descartadas: { fila: number; motivo: string }[] = []

  filas.forEach((fila, indice) => {
    const numeroFila = indice + 2 // +1 por el índice base 0, +1 por la cabecera

    const elaboracion = String(fila[columnas.elaboracion] ?? '').trim()
    const ingrediente = String(fila[columnas.ingrediente] ?? '').trim()

    if (!elaboracion && !ingrediente) return // fila en blanco: ni error ni dato

    if (!elaboracion) {
      descartadas.push({ fila: numeroFila, motivo: 'Sin nombre de elaboración' })
      return
    }
    if (!ingrediente) {
      descartadas.push({ fila: numeroFila, motivo: 'Sin nombre de ingrediente' })
      return
    }

    const cantidad = leerNumero(fila[columnas.cantidad])
    if (cantidad === null || cantidad <= 0) {
      descartadas.push({
        fila: numeroFila,
        motivo: `Cantidad no válida para "${ingrediente}"`,
      })
      return
    }

    const unidad = resolverUnidad(String(fila[columnas.unidad] ?? ''))
    const raciones = columnas.raciones ? leerNumero(fila[columnas.raciones]) : null
    const pvp = columnas.pvp ? leerNumero(fila[columnas.pvp]) : null

    validas.push({
      elaboracion,
      ingrediente,
      cantidad: cantidad * unidad.factor,
      unidad: unidad.unidad,
      mermaPct: columnas.merma ? leerMerma(fila[columnas.merma]) : 0,
      raciones: raciones && raciones > 0 ? raciones : 1,
      unidadRacion: columnas.unidadRacion
        ? String(fila[columnas.unidadRacion] ?? '').trim() || 'ración'
        : 'ración',
      pvp: pvp && pvp > 0 ? pvp : null,
      unidadOriginal: unidad.original,
      unidadReconocida: unidad.reconocida,
    })
  })

  return { validas, descartadas }
}
