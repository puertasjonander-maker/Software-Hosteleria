import { hoyEnMadrid, partesEnMadrid } from '@/lib/time'

/** Por defecto el panel mira los últimos 90 días (MISE-007). */
export const DIAS_POR_DEFECTO = 90

/**
 * Con menos de cuatro semanas de recepciones, una tendencia no es una
 * tendencia: son cuatro puntos y una casualidad. El panel lo dice en vez de
 * dibujar una línea que invite a decidir sobre ella.
 */
export const DIAS_MINIMOS_TENDENCIA = 28

export type Rango = { desde: string; hasta: string }

export function rangoDesdeParams(params: {
  desde?: string
  hasta?: string
}): Rango {
  const hasta = esFechaValida(params.hasta) ? params.hasta! : hoyEnMadrid()

  if (esFechaValida(params.desde)) {
    // Un rango al revés se corrige en vez de devolver cero resultados.
    return params.desde! <= hasta
      ? { desde: params.desde!, hasta }
      : { desde: hasta, hasta: params.desde! }
  }

  const inicio = new Date(`${hasta}T12:00:00Z`)
  inicio.setUTCDate(inicio.getUTCDate() - DIAS_POR_DEFECTO)
  const p = partesEnMadrid(inicio)

  return {
    desde: `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`,
    hasta,
  }
}

function esFechaValida(valor: string | undefined): boolean {
  return Boolean(valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(valor)))
}

export function diasEnRango(rango: Rango): number {
  const a = Date.parse(`${rango.desde}T12:00:00Z`)
  const b = Date.parse(`${rango.hasta}T12:00:00Z`)
  return Math.max(1, Math.round((b - a) / 86400000) + 1)
}

const MESES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

/** '2026-08-14' → { clave: '2026-08', etiqueta: 'ago 2026' } */
export function mesDe(fechaISO: string): { clave: string; etiqueta: string } {
  const [anio, mes] = fechaISO.split('-')
  return {
    clave: `${anio}-${mes}`,
    etiqueta: `${MESES[Number(mes) - 1] ?? mes} ${anio}`,
  }
}
