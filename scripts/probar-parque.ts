import { readFileSync } from 'node:fs'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { canonizarFilas, interpretarParque, leerFecha, peorSemaforo, textoRevision } from '../src/lib/parque'
import type { Semaforo } from '../src/lib/database.types'

/*
 * Prueba del intérprete del CSV del parque (EBX-103).
 *
 * No hay framework de test en el proyecto y esto no lo justifica todavía, pero
 * este trozo sí necesita una: lee ficheros hechos a mano, en dos formatos, con
 * fechas en formato español. La primera versión daba por buenas las doce filas
 * del parque de demo interpretando "08/09/2026" como el 9 de agosto.
 *
 *   npm run probar:parque
 */

let fallos = 0
function comprobar(que: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`${ok ? '  ok ' : 'FALLO'} ${que}${ok ? '' : ` → ${JSON.stringify(real)} (esperaba ${JSON.stringify(esperado)})`}`)
}

// ── El CSV de demo: doce máquinas, el mismo reparto que IronBuster ───────────

// Mismo camino que `leerFicheroParque` para un CSV: papaparse, sin interpretar.
const filas = Papa.parse<Record<string, unknown>>(
  readFileSync(new URL('../seed/parque.demo.csv', import.meta.url), 'utf8'),
  { header: true, skipEmptyLines: 'greedy', transformHeader: (h: string) => h.trim() },
).data

// Y el camino de un .xlsx: fechas resueltas por Excel, que llegan como Date.
const hoja = XLSX.utils.aoa_to_sheet([
  ['nombre', 'tipo', 'ultima_revision'],
  ['RowErg 1', 'remo', new Date(2026, 8, 8)],
])
const libro = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(libro, hoja, 'h')
const ida = XLSX.read(XLSX.write(libro, { type: 'array', bookType: 'xlsx' }), {
  type: 'array',
  cellDates: true,
})
const desdeExcel = interpretarParque(
  XLSX.utils.sheet_to_json<Record<string, unknown>>(ida.Sheets.h, { defval: '', raw: true }),
)
console.log('\n== Camino .xlsx ==')
comprobar('8 sep sigue siendo 8 sep', desdeExcel.validas[0]?.ultimaRevision, '2026-09-08')

const r = interpretarParque(filas)
console.log('\n== CSV de demo ==')
comprobar('doce filas válidas', r.validas.length, 12)
comprobar('sin problemas', r.problemas, [])
comprobar('cinco remos', r.validas.filter((f) => f.tipo === 'rowerg').length, 5)
comprobar('un ski', r.validas.filter((f) => f.tipo === 'skierg').length, 1)
comprobar('un bikeerg', r.validas.filter((f) => f.tipo === 'bikeerg').length, 1)
comprobar('cinco air bikes (1 maniak + 4 eco)', r.validas.filter((f) => f.tipo === 'air_bike').length, 5)
comprobar('fecha dd/mm/aaaa del ski', r.validas.find((f) => f.nombre === 'SkiErg 1')?.ultimaRevision, '2026-09-08')
comprobar('fecha iso del remo 1', r.validas.find((f) => f.nombre === 'RowErg 1')?.ultimaRevision, '2026-07-08')
comprobar('sin nº de serie queda a null', r.validas.find((f) => f.nombre === 'RowErg 3')?.numSerie, null)
comprobar('cadencia vacía queda a null', r.validas.find((f) => f.nombre === 'Echo bike 1')?.cadenciaMeses, null)
comprobar('estado "sin revisar" con espacio', r.validas.find((f) => f.nombre === 'RowErg 5')?.estado, 'sin_revisar')
comprobar('nota con coma entrecomillada', r.validas.find((f) => f.nombre === 'Echo bike 4')?.notas, 'Raster, cuenta como Eco')

// ── Filas que no deben entrar ────────────────────────────────────────────────

const malas = interpretarParque([
  { nombre: '', tipo: 'remo' },
  { nombre: 'RowErg 9', tipo: 'lavadora' },
  { nombre: 'RowErg 8', estado: 'morado' },
  { nombre: 'RowErg 7', cadencia_meses: '99' },
  { nombre: 'RowErg 6', cadencia_meses: '0' },
  { nombre: 'RowErg 5', ultima_revision: 'el martes' },
  { nombre: 'Repetida' },
  { nombre: 'REPETIDA' },
])

console.log('\n== Filas inválidas ==')
comprobar('solo entra la primera "Repetida"', malas.validas.map((f) => f.nombre), ['Repetida'])
comprobar('siete problemas', malas.problemas.length, 7)
comprobar('la fila sin nombre es la 2', malas.problemas[0], { fila: 2, motivo: 'Sin nombre de máquina' })
comprobar('tipo desconocido', malas.problemas[1].motivo, 'Tipo desconocido: "lavadora"')
comprobar('estado desconocido', malas.problemas[2].motivo, 'Estado desconocido: "morado"')
comprobar('cadencia 99 fuera de rango', malas.problemas[3].motivo, 'La cadencia tiene que estar entre 1 y 36 meses')
comprobar('cadencia 0 fuera de rango', malas.problemas[4].motivo, 'La cadencia tiene que estar entre 1 y 36 meses')
comprobar('fecha ilegible', malas.problemas[5].motivo.startsWith('Fecha no reconocida'), true)
comprobar('duplicado insensible a mayúsculas', malas.problemas[6].motivo, '"REPETIDA" aparece más de una vez')

// ── Fechas sueltas ───────────────────────────────────────────────────────────

console.log('\n== Fechas ==')
comprobar('8/9/2026 con un dígito', leerFecha('8/9/2026'), '2026-09-08')
comprobar('guiones', leerFecha('08-09-2026'), '2026-09-08')
comprobar('iso con hora', leerFecha('2026-09-08T00:00:00Z'), '2026-09-08')
comprobar('vacío', leerFecha(''), null)

// ── Peor semáforo ────────────────────────────────────────────────────────────

console.log('\n== Peor semáforo ==')
const casos: Array<[Semaforo[], Semaforo | null]> = [
  [['verde', 'verde', 'rojo'], 'rojo'],
  [['verde', 'ambar'], 'ambar'],
  [['verde', 'sin_revisar'], 'sin_revisar'],
  [['ambar', 'sin_revisar'], 'ambar'],
  [['verde'], 'verde'],
  [[], null],
]
for (const [entrada, esperado] of casos) {
  comprobar(`[${entrada.join(', ')}]`, peorSemaforo(entrada), esperado)
}

// ── Cómo se lee la próxima revisión ──────────────────────────────────────────
// Lejos en meses, cerca en semanas, encima en días y vencida como retraso. Las
// fronteras son lo único interesante: 7 y 8 días, 30 y 31, y el cero.

console.log('\n== Texto de la próxima revisión ==')
const revisiones: Array<[number | null, { texto: string; avisa: boolean } | null]> = [
  [null, null],
  [-13, { texto: '13 días tarde', avisa: true }],
  [-1, { texto: '1 día tarde', avisa: true }],
  [0, { texto: 'toca hoy', avisa: true }],
  [1, { texto: 'en 1 día', avisa: true }],
  [7, { texto: 'en 7 días', avisa: true }],
  [8, { texto: 'en 1 semana', avisa: false }],
  [14, { texto: 'en 2 semanas', avisa: false }],
  [21, { texto: 'en 3 semanas', avisa: false }],
  [30, { texto: 'en 4 semanas', avisa: false }],
  // Redondeo hacia abajo: 31 días son «1 mes», nunca «2». Nadie se queda
  // tranquilo de más por culpa de una división.
  [31, { texto: 'en 1 mes', avisa: false }],
  [59, { texto: 'en 1 mes', avisa: false }],
  [60, { texto: 'en 2 meses', avisa: false }],
  [180, { texto: 'en 6 meses', avisa: false }],
]
for (const [dias, esperado] of revisiones) {
  comprobar(`${dias === null ? 'sin cadencia' : `${dias} días`}`, textoRevision({ diasHastaRevision: dias }), esperado)
}

// ── Un CSV exportado de Notion, tal cual sale ────────────────────────────────
// Las columnas son las suyas, los valores de Estado y Tipo son los suyos, y las
// fechas van con el mes escrito. Este es el camino corto: exportar de Notion y
// soltar el fichero, sin token ni integración.

console.log('\n== CSV exportado de Notion ==')

const notion = Papa.parse<Record<string, unknown>>(
  [
    'Máquina,Tipo,Nº serie,Estado,Notas,Fecha de servicio,Damper,Importe €',
    'RowErg 5,RowErg,250123,Servicio hecho,Cadena algo seca,"September 8, 2026",5,45',
    'Echo bike 1,Assault / Echo,,Por revisar,,,N/A,',
    'Barra 3,Barra olímpica,,Rojo,Rosca pasada,8 de septiembre de 2026,,',
  ].join('\n'),
  { header: true, skipEmptyLines: 'greedy', transformHeader: (h: string) => h.trim() },
).data

const deNotion = interpretarParque(canonizarFilas(notion))

comprobar('entran las tres máquinas', deNotion.validas.length, 3)
comprobar('sin ninguna fila rechazada', deNotion.problemas.length, 0)
comprobar('el título es el nombre', deNotion.validas[0].nombre, 'RowErg 5')
comprobar('«Servicio hecho» es verde', deNotion.validas[0].estado, 'verde')
comprobar('«Por revisar» es sin revisar', deNotion.validas[1].estado, 'sin_revisar')
comprobar('«Assault / Echo» es air_bike', deNotion.validas[1].tipo, 'air_bike')
comprobar('«Barra olímpica» es barra', deNotion.validas[2].tipo, 'barra')
comprobar('«Nº serie» llega a num_serie', deNotion.validas[0].numSerie, '250123')
comprobar('fecha en inglés', deNotion.validas[0].ultimaRevision, '2026-09-08')
comprobar('fecha en español', deNotion.validas[2].ultimaRevision, '2026-09-08')
comprobar('sin fecha se queda vacía', deNotion.validas[1].ultimaRevision, null)
comprobar('las columnas de más no estorban', deNotion.validas[0].notas, 'Cadena algo seca')

// Nuestra columna gana sobre el alias: una hoja con las dos no se pisa.
const ambas = canonizarFilas([
  { nombre: 'RowErg 1', ultima_revision: '2026-01-02', 'Fecha de servicio': '2020-01-01' },
])
comprobar('la columna propia gana al alias', ambas[0].ultima_revision, '2026-01-02')

console.log('\n== Meses sueltos ==')
comprobar('marzo', leerFecha('3 de marzo de 2026'), '2026-03-03')
comprobar('March', leerFecha('March 3, 2026'), '2026-03-03')
comprobar('sin año no vale', leerFecha('3 de marzo'), null)
comprobar('texto cualquiera', leerFecha('la semana pasada'), null)

console.log(`\n${fallos === 0 ? 'TODO OK' : `${fallos} FALLOS`}`)
process.exit(fallos === 0 ? 0 : 1)
