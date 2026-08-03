import type { SupplierScheduleRow } from '@/lib/database.types'
import {
  DIAS_SEMANA,
  horaAMinutos,
  madridAInstante,
  minutosAHora,
  partesEnMadrid,
} from '@/lib/time'

/**
 * Ventana de corte de un proveedor.
 *
 * `vencido` no significa "ya no se puede pedir": significa que hoy tocaba y la
 * hora pasó. MISE-002 exige que eso se vea destacado y no que desaparezca de la
 * bandeja — un pedido que se ha escapado es exactamente lo que el encargado
 * necesita ver primero.
 */
export type EstadoCorte = 'sin_pauta' | 'vencido' | 'proximo' | 'holgado'

export type Corte = {
  estado: EstadoCorte
  /** Minutos hasta el próximo corte. Negativo si el de hoy ya pasó. */
  minutosHasta: number | null
  /** Instante real del próximo corte, para mostrar fecha y hora. */
  proximoCorte: Date | null
  /** "martes a las 09:30" */
  etiqueta: string | null
  /** Fecha estimada de entrega asociada al próximo corte. */
  entregaEstimada: Date | null
}

const UMBRAL_PROXIMO_MIN = 120 // "corte próximo" = menos de 2 h (MISE-002)

export function calcularCorte(
  pautas: SupplierScheduleRow[],
  ahora: Date = new Date(),
): Corte {
  if (pautas.length === 0) {
    return {
      estado: 'sin_pauta',
      minutosHasta: null,
      proximoCorte: null,
      etiqueta: null,
      entregaEstimada: null,
    }
  }

  const p = partesEnMadrid(ahora)
  const minutosAhora = p.hour * 60 + p.minute

  // ¿Alguna pauta de HOY cuya hora ya pasó? Eso es lo que se destaca.
  const vencidasHoy = pautas
    .filter((s) => s.order_weekday === p.weekday)
    .map((s) => horaAMinutos(s.cutoff_time))
    .filter((min) => min <= minutosAhora)

  let mejor: { pauta: SupplierScheduleRow; minutos: number } | null = null

  for (const pauta of pautas) {
    const minutoCorte = horaAMinutos(pauta.cutoff_time)
    let dias = (pauta.order_weekday - p.weekday + 7) % 7
    if (dias === 0 && minutoCorte <= minutosAhora) dias = 7

    const minutos = dias * 1440 + (minutoCorte - minutosAhora)
    if (mejor === null || minutos < mejor.minutos) mejor = { pauta, minutos }
  }

  if (!mejor) {
    return {
      estado: 'sin_pauta',
      minutosHasta: null,
      proximoCorte: null,
      etiqueta: null,
      entregaEstimada: null,
    }
  }

  const minutoCorte = horaAMinutos(mejor.pauta.cutoff_time)
  const diasHasta = Math.floor((mejor.minutos + minutosAhora) / 1440)
  const proximoCorte = madridAInstante(
    p.year,
    p.month,
    p.day + diasHasta,
    Math.floor(minutoCorte / 60),
    minutoCorte % 60,
  )

  const entrega = madridAInstante(
    p.year,
    p.month,
    p.day + diasHasta + Math.max(mejor.pauta.lead_time_days, 0),
    9,
    0,
  )

  const estado: EstadoCorte =
    vencidasHoy.length > 0
      ? 'vencido'
      : mejor.minutos <= UMBRAL_PROXIMO_MIN
        ? 'proximo'
        : 'holgado'

  return {
    estado,
    // Si hoy se pasó el corte, el número que interesa al encargado es cuánto
    // hace que se le escapó, no cuándo vuelve a tocar la semana que viene.
    minutosHasta:
      estado === 'vencido'
        ? -(minutosAhora - Math.max(...vencidasHoy))
        : mejor.minutos,
    proximoCorte,
    etiqueta: `${DIAS_SEMANA[mejor.pauta.order_weekday]} a las ${minutosAHora(minutoCorte)}`,
    entregaEstimada: entrega,
  }
}
