import { TZ } from '@/lib/time'

const EUR = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const EUR_PRECISO = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})

const FECHA = new Intl.DateTimeFormat('es-ES', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const FECHA_HORA = new Intl.DateTimeFormat('es-ES', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const FECHA_LARGA = new Intl.DateTimeFormat('es-ES', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

export function euros(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—'
  return EUR.format(valor)
}

/** Para importes donde la tercera decimal todavía importa. */
export function eurosPrecisos(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—'
  return EUR_PRECISO.format(valor)
}

/** Cantidades sin decimales cuando son enteras: "3", no "3,00". */
export function cantidad(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—'
  const redondeado = Math.round(valor * 1000) / 1000
  return Number.isInteger(redondeado)
    ? String(redondeado)
    : redondeado.toLocaleString('es-ES', { maximumFractionDigits: 3 })
}

export function porcentaje(valor: number | null | undefined, decimales = 1): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—'
  return `${valor.toLocaleString('es-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimales,
  })} %`
}

function aDate(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null
  // Las columnas `date` de Postgres llegan como 'YYYY-MM-DD' sin zona. Añadimos
  // mediodía UTC para que el formateo a Madrid no las mueva al día anterior.
  const d = valor instanceof Date ? valor : new Date(/^\d{4}-\d{2}-\d{2}$/.test(valor) ? `${valor}T12:00:00Z` : valor)
  return Number.isNaN(d.getTime()) ? null : d
}

export function fecha(valor: string | Date | null | undefined): string {
  const d = aDate(valor)
  return d ? FECHA.format(d) : '—'
}

export function fechaHora(valor: string | Date | null | undefined): string {
  const d = aDate(valor)
  return d ? FECHA_HORA.format(d) : '—'
}

export function fechaLarga(valor: string | Date | null | undefined): string {
  const d = aDate(valor)
  return d ? FECHA_LARGA.format(d) : '—'
}

/** "3 productos" / "1 producto". El plural mal puesto se nota y resta confianza. */
export function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`
}
