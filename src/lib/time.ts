/**
 * Utilidades de fecha ancladas a Europe/Madrid.
 *
 * El servidor corre en UTC y los móviles del equipo pueden estar en cualquier
 * zona, pero "la hora de corte son las 11:00" significa las 11:00 de Málaga.
 * Todo lo que dependa de la hora de corte pasa por aquí, y no por `new Date()`
 * a secas, que en Vercel daría una hora de menos en invierno y dos en verano.
 */

export const TZ = 'Europe/Madrid'

export const DIAS_SEMANA = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const

type Partes = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekday: number // 0 = domingo
}

const FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
})

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/** Descompone un instante en su hora de pared madrileña. */
export function partesEnMadrid(at: Date = new Date()): Partes {
  const parts = FORMATTER.formatToParts(at)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0'

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    // '24' aparece a medianoche en algunos runtimes con hour12:false.
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
  }
}

function offsetMinutos(at: Date): number {
  const p = partesEnMadrid(at)
  const comoUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return (comoUtc - at.getTime()) / 60000
}

/**
 * Convierte una hora de pared madrileña al instante real correspondiente.
 * Dos pasadas: la primera estima el desfase, la segunda lo corrige si el cambio
 * de hora cae justo en medio.
 */
export function madridAInstante(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const ingenuo = Date.UTC(year, month - 1, day, hour, minute)
  const primera = new Date(ingenuo - offsetMinutos(new Date(ingenuo)) * 60000)
  return new Date(ingenuo - offsetMinutos(primera) * 60000)
}

/** Fecha de hoy en Madrid como `YYYY-MM-DD`. */
export function hoyEnMadrid(at: Date = new Date()): string {
  const p = partesEnMadrid(at)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** `HH:MM:SS` o `HH:MM` → minutos desde medianoche. */
export function horaAMinutos(hora: string): number {
  const [h = '0', m = '0'] = hora.split(':')
  return Number(h) * 60 + Number(m)
}

export function minutosAHora(minutos: number): string {
  const m = ((minutos % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** "en 3 h 20 min", "hace 45 min". Sin librería: son cuatro casos. */
export function duracionRelativa(minutos: number): string {
  const abs = Math.abs(Math.round(minutos))
  const prefijo = minutos < 0 ? 'hace ' : 'en '

  if (abs < 1) return 'ahora mismo'
  if (abs < 60) return `${prefijo}${abs} min`

  const horas = Math.floor(abs / 60)
  const resto = abs % 60

  if (horas < 24) {
    return resto === 0 ? `${prefijo}${horas} h` : `${prefijo}${horas} h ${resto} min`
  }

  const dias = Math.floor(horas / 24)
  const horasResto = horas % 24
  return horasResto === 0
    ? `${prefijo}${dias} ${dias === 1 ? 'día' : 'días'}`
    : `${prefijo}${dias} ${dias === 1 ? 'día' : 'días'} ${horasResto} h`
}
