import type { TipoMaquina } from '@/lib/database.types'
import type { MaquinaFila } from '@/lib/parque'

/**
 * Valor de reposición estimado por tipo de máquina (EBX-505).
 *
 * Un parque no viene con etiqueta de precio, y nadie se sienta a apuntar cuánto
 * pagó por cada máquina cuando la da de alta: el valor del parque se estima con
 * el precio de referencia de cada tipo. Son precios de NUEVO, IVA incluido,
 * mercado español, recogidos en septiembre de 2026 de tiendas en línea (fitshop.es,
 * Rogue ES, Strength Shop, Gym Company, Fitness Tech):
 *
 *   rowerg   1.195 €   Concept2 RowErg (fitshop.es, patas estándar)
 *   skierg   1.040 €   Concept2 SkiErg montaje de pared (Rogue ES); con
 *                      plataforma de suelo sube a ~1.425 €
 *   bikeerg  1.400 €   Concept2 BikeErg (Strength Shop)
 *   air_bike   900 €   Rogue Echo Bike V3 961,95 € / Assault AirBike ~845 €
 *   cinta    1.500 €   comercial de entrada (1.199–1.409 €); las profesionales
 *                      de gimnasio llegan a 3.395 €
 *   barra      300 €   olímpica de gama media; Eleiko/Rogue cerakote mucho más
 *   disco       70 €   bumper ~20 kg a ~4 €/kg; es la estimación más frágil
 *                      porque depende del peso de cada disco
 *   rack        500 €  power rack (399–469 €); un rig a medida, mucho más
 *   otro       null    sin referencia: no se puede estimar sin saber qué es
 *
 * Es un valor orientativo de reposición, no el valor contable ni el de segunda
 * mano. La pantalla lo dice con un pie en vez de esconderlo.
 */
export const VALOR_REFERENCIA: Record<TipoMaquina, number | null> = {
  rowerg: 1195,
  skierg: 1040,
  bikeerg: 1400,
  air_bike: 900,
  cinta: 1500,
  barra: 300,
  disco: 70,
  rack: 500,
  otro: null,
}

/** Lo que valdría reponer esta máquina a día de hoy. Null = sin referencia. */
export function valorDeMaquina(m: MaquinaFila): number | null {
  return VALOR_REFERENCIA[m.tipo]
}

export type LineaValor = {
  tipo: TipoMaquina
  cantidad: number
  /** Precio de referencia unitario (nuevo, IVA incluido). */
  unitario: number
  subtotal: number
}

export type ValorParque = {
  total: number
  lineas: LineaValor[]
  /** Máquinas activas sin precio de referencia (tipo «otro»), no incluidas. */
  sinReferencia: number
}

/**
 * El valor estimado de un parque, por tipo y total.
 *
 * Solo cuentan las máquinas activas, igual que en el resto de resúmenes: una
 * máquina dada de baja ya no está en el box, y su valor no debería sumar.
 */
export function valorDelParque(maquinas: MaquinaFila[]): ValorParque {
  const activas = maquinas.filter((m) => m.activa)
  const cantidadPorTipo = new Map<TipoMaquina, number>()

  let sinReferencia = 0
  for (const m of activas) {
    const unitario = VALOR_REFERENCIA[m.tipo]
    if (unitario === null) {
      sinReferencia += 1
      continue
    }
    cantidadPorTipo.set(m.tipo, (cantidadPorTipo.get(m.tipo) ?? 0) + 1)
  }

  const lineas: LineaValor[] = []
  let total = 0

  for (const [tipo, cantidad] of cantidadPorTipo) {
    const unitario = VALOR_REFERENCIA[tipo]!
    const subtotal = unitario * cantidad
    lineas.push({ tipo, cantidad, unitario, subtotal })
    total += subtotal
  }

  // El tipo que más pesa en el total arriba: se lee primero lo que más vale.
  lineas.sort((a, b) => b.subtotal - a.subtotal)

  return { total, lineas, sinReferencia }
}
