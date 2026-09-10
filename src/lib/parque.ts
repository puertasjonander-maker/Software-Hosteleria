import type { Semaforo, TipoMaquina } from '@/lib/database.types'
import { ORDEN_SEMAFORO } from '@/lib/roles'

/**
 * Interpretación del CSV del parque de un box (EBX-103).
 *
 * Una fila por máquina. El formato lo fijamos nosotros porque es una plantilla
 * que damos, no un Excel que ya existía en la casa: por eso la pantalla ofrece
 * descargar la plantilla en vez de un mapeo de columnas.
 *
 * Todo lo que no sea `nombre` es opcional. Es deliberado: el inventario de una
 * primera visita se toma de pie y con prisa, y en IronBuster se cerró sin los
 * números de serie de la mitad del parque. Un importador que exija el dato
 * completo obliga a inventárselo.
 */

export const COLUMNAS_PARQUE = [
  'nombre',
  'tipo',
  'marca',
  'modelo',
  'num_serie',
  'ubicacion',
  'estado',
  'cadencia_meses',
  'ultima_revision',
  'notas',
] as const

/** Solo `nombre` hace falta para que una fila entre. */
export const COLUMNAS_PARQUE_OBLIGATORIAS = ['nombre'] as const

export type FilaParque = {
  nombre: string
  tipo: TipoMaquina
  marca: string | null
  modelo: string | null
  numSerie: string | null
  ubicacion: string | null
  estado: Semaforo
  cadenciaMeses: number | null
  ultimaRevision: string | null
  notas: string | null
}

export type ProblemaFila = { fila: number; motivo: string }

/**
 * Lee el fichero elegido y devuelve una fila por máquina, con todo en crudo.
 *
 * Los dos caminos existen por una razón concreta, no por comodidad. Un CSV se
 * parte con papaparse, que no interpreta nada y devuelve texto: si lo leyera el
 * lector de Excel, adivinaría qué celdas son fechas y en qué orden, y adivina en
 * orden americano. Con eso, el `08/09/2026` de una hoja rellenada aquí (8 de
 * septiembre) se convertía en el 9 de agosto sin decir nada.
 *
 * En un .xlsx de verdad no hay nada que adivinar: Excel guarda las fechas como
 * número de serie, así que ahí sí se deja que el lector las resuelva y lleguen
 * como `Date`.
 */
export async function leerFicheroParque(fichero: File): Promise<Record<string, unknown>[]> {
  const esCsv = /\.csv$/i.test(fichero.name) || fichero.type === 'text/csv'

  if (esCsv) {
    const Papa = (await import('papaparse')).default
    const { data } = Papa.parse<Record<string, unknown>>(await fichero.text(), {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
    })
    return data
  }

  const XLSX = await import('xlsx')
  const wb = XLSX.read(await fichero.arrayBuffer(), { type: 'array', cellDates: true })
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], {
    defval: '',
    raw: true,
  })
}

/*
 * Sinónimos de tipo. La lista es larga a propósito: lo que se teclea en una
 * hoja es "remo", "rower" o "RowErg" según quién la rellene, y rechazar la fila
 * por eso convierte una importación en un ejercicio de ortografía.
 */
const TIPOS: Record<string, TipoMaquina> = {
  rowerg: 'rowerg',
  remo: 'rowerg',
  remos: 'rowerg',
  rower: 'rowerg',
  row: 'rowerg',
  skierg: 'skierg',
  ski: 'skierg',
  esqui: 'skierg',
  bikeerg: 'bikeerg',
  bike: 'bikeerg',
  bicicleta: 'bikeerg',
  air_bike: 'air_bike',
  'air bike': 'air_bike',
  airbike: 'air_bike',
  assault: 'air_bike',
  echo: 'air_bike',
  'echo bike': 'air_bike',
  'eco bike': 'air_bike',
  cinta: 'cinta',
  treadmill: 'cinta',
  barra: 'barra',
  barras: 'barra',
  disco: 'disco',
  discos: 'disco',
  rack: 'rack',
  jaula: 'rack',
  otro: 'otro',
}

const ESTADOS: Record<string, Semaforo> = {
  verde: 'verde',
  ok: 'verde',
  bien: 'verde',
  ambar: 'ambar',
  ámbar: 'ambar',
  amarillo: 'ambar',
  atencion: 'ambar',
  atención: 'ambar',
  rojo: 'rojo',
  urgente: 'rojo',
  mal: 'rojo',
  sin_revisar: 'sin_revisar',
  'sin revisar': 'sin_revisar',
  '': 'sin_revisar',
}

function texto(valor: unknown): string {
  return String(valor ?? '').trim()
}

function textoONulo(valor: unknown): string | null {
  const t = texto(valor)
  return t === '' ? null : t
}

function clave(valor: unknown): string {
  return texto(valor).toLowerCase()
}

export function leerNumero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  const bruto = texto(valor)
  if (bruto === '') return null
  // Coma decimal española: "2,5" es dos y medio, no un separador de miles.
  const numero = Number(bruto.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(numero) ? numero : null
}

/**
 * Fechas. Acepta el ISO de una plantilla bien rellenada, el `dd/mm/aaaa` que
 * escribe una persona, y el `Date` que devuelve el lector de Excel. Siempre en
 * orden español: `08/09/2026` es el 8 de septiembre.
 *
 * Devuelve `aaaa-mm-dd`, que es lo que espera Postgres para un `date`.
 */
export function leerFecha(valor: unknown): string | null {
  // De un .xlsx las fechas llegan ya resueltas: Excel las guarda como número de
  // serie, no como texto, así que ahí no hay ambigüedad que deshacer. Se leen
  // por partes locales y no con toISOString(), que desplazaría un día entero a
  // quien esté en una zona por detrás de UTC.
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null
    const mes = String(valor.getMonth() + 1).padStart(2, '0')
    const dia = String(valor.getDate()).padStart(2, '0')
    return `${valor.getFullYear()}-${mes}-${dia}`
  }

  const bruto = texto(valor)
  if (bruto === '') return null

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(bruto)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const local = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(bruto)
  if (local) {
    const dia = local[1].padStart(2, '0')
    const mes = local[2].padStart(2, '0')
    return `${local[3]}-${mes}-${dia}`
  }

  return null
}

export function interpretarParque(filas: Record<string, unknown>[]): {
  validas: FilaParque[]
  problemas: ProblemaFila[]
} {
  const validas: FilaParque[] = []
  const problemas: ProblemaFila[] = []
  const vistos = new Set<string>()

  filas.forEach((fila, indice) => {
    // +2: la fila 1 del fichero es la cabecera, y quien mira el error tiene el
    // CSV abierto delante con esa numeración.
    const numero = indice + 2

    const nombre = texto(fila.nombre)
    if (nombre === '') {
      problemas.push({ fila: numero, motivo: 'Sin nombre de máquina' })
      return
    }

    // El nombre es la clave dentro de un box: cinco remos idénticos solo se
    // distinguen por "RowErg 1".."RowErg 5". Dos filas iguales serían un
    // choque contra el índice único, y es mejor decirlo aquí.
    const repetida = nombre.toLowerCase()
    if (vistos.has(repetida)) {
      problemas.push({ fila: numero, motivo: `"${nombre}" aparece más de una vez` })
      return
    }
    vistos.add(repetida)

    const tipoBruto = clave(fila.tipo)
    const tipo = tipoBruto === '' ? 'otro' : TIPOS[tipoBruto]
    if (!tipo) {
      problemas.push({ fila: numero, motivo: `Tipo desconocido: "${texto(fila.tipo)}"` })
      return
    }

    const estado = ESTADOS[clave(fila.estado)]
    if (!estado) {
      problemas.push({ fila: numero, motivo: `Estado desconocido: "${texto(fila.estado)}"` })
      return
    }

    const cadenciaBruta = leerNumero(fila.cadencia_meses)
    let cadencia: number | null = null
    if (cadenciaBruta !== null) {
      cadencia = Math.round(cadenciaBruta)
      if (cadencia < 1 || cadencia > 36) {
        problemas.push({ fila: numero, motivo: 'La cadencia tiene que estar entre 1 y 36 meses' })
        return
      }
    }

    const ultima = leerFecha(fila.ultima_revision)
    if (ultima === null && texto(fila.ultima_revision) !== '') {
      problemas.push({
        fila: numero,
        motivo: `Fecha no reconocida: "${texto(fila.ultima_revision)}". Usa aaaa-mm-dd o dd/mm/aaaa`,
      })
      return
    }

    validas.push({
      nombre,
      tipo,
      marca: textoONulo(fila.marca),
      modelo: textoONulo(fila.modelo),
      numSerie: textoONulo(fila.num_serie),
      ubicacion: textoONulo(fila.ubicacion),
      estado,
      cadenciaMeses: cadencia,
      ultimaRevision: ultima,
      notas: textoONulo(fila.notas),
    })
  })

  return { validas, problemas }
}

/**
 * El semáforo de un parque entero es el de su máquina peor. No es un promedio a
 * propósito: si de doce máquinas hay una en rojo, el parque está en rojo, y una
 * media lo pintaría de verde.
 */
export function peorSemaforo(estados: Semaforo[]): Semaforo | null {
  if (estados.length === 0) return null
  return estados.reduce((peor, actual) =>
    ORDEN_SEMAFORO[actual] < ORDEN_SEMAFORO[peor] ? actual : peor,
  )
}

/** Contenido de la plantilla que se descarga desde el importador. */
export function plantillaParqueCsv(): string {
  const cabecera = COLUMNAS_PARQUE.join(',')
  const ejemplos = [
    'RowErg 1,remo,Concept2,Model D,250123,sala principal,verde,2,2026-07-08,',
    'SkiErg 1,ski,Concept2,,,sala principal,ambar,2,,Damper duro',
    'Echo bike 1,air bike,Rogue,,,altillo,sin revisar,,,',
    'Barra olímpica 1,barra,Eleiko,,,rack 3,verde,6,,',
  ]
  return [cabecera, ...ejemplos].join('\n') + '\n'
}
