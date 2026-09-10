import { supabase } from '@/lib/supabase'
import { oReventar, resultado, type Resultado } from '@/datos/resultado'
import { comoMaquinaFila, type FilaParque, type MaquinaFila } from '@/lib/parque'
import type { Semaforo, TipoMaquina } from '@/lib/database.types'

/** El parque de un box: alta, ficha, importación (EBX-102, EBX-103, EBX-104). */

/**
 * El parque de un box.
 *
 * El `eq('cliente_id')` es para pedir un box concreto teniendo varios delante, no
 * para aislar: quien aísla es la RLS, y a un cliente le devuelve solo el suyo
 * ponga lo que ponga aquí.
 */
export async function parqueDeBox(clienteId: string): Promise<MaquinaFila[]> {
  const filas = oReventar(
    await supabase.from('parque_estado').select('*').eq('cliente_id', clienteId).order('nombre'),
  )
  return filas.map(comoMaquinaFila)
}

/** El parque que alcanza quien pregunta. Para un cliente, el suyo y solo el suyo. */
export async function miParque(): Promise<MaquinaFila[]> {
  const filas = oReventar(await supabase.from('parque_estado').select('*').order('nombre'))
  return filas.map(comoMaquinaFila)
}

export async function obtenerMaquina(id: string): Promise<MaquinaFila> {
  return comoMaquinaFila(
    oReventar(await supabase.from('parque_estado').select('*').eq('id', id).maybeSingle()),
  )
}

export type DatosMaquina = {
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

function comoFila(clienteId: string, datos: DatosMaquina) {
  return {
    cliente_id: clienteId,
    nombre: datos.nombre,
    tipo: datos.tipo,
    marca: datos.marca,
    modelo: datos.modelo,
    num_serie: datos.numSerie,
    ubicacion: datos.ubicacion,
    estado: datos.estado,
    cadencia_meses: datos.cadenciaMeses,
    ultima_revision: datos.ultimaRevision,
    notas: datos.notas,
  }
}

export async function guardarMaquina(
  clienteId: string,
  id: string | null,
  datos: DatosMaquina,
): Promise<Resultado> {
  const fila = comoFila(clienteId, datos)

  const { error } = id
    ? await supabase.from('maquinas').update(fila).eq('id', id)
    : await supabase.from('maquinas').insert(fila)

  return resultado(error, 'una máquina')
}

/**
 * Una máquina se desactiva, no se borra.
 *
 * Borrarla se llevaría por delante su histórico y sus fotos, que es justo la
 * prueba del trabajo cobrado. Una máquina que sale del box queda inactiva y su
 * ficha se sigue pudiendo consultar. La baja la escribe un trigger.
 */
export async function alternarMaquina(id: string, activa: boolean): Promise<Resultado> {
  const { error } = await supabase.from('maquinas').update({ activa }).eq('id', id)
  return resultado(error, 'una máquina')
}

export async function contarMaquinas(clienteId: string): Promise<number> {
  const { count } = await supabase
    .from('maquinas')
    .select('id', { count: 'exact', head: true })
    .eq('cliente_id', clienteId)
  return count ?? 0
}

export type ResumenImportacion =
  | { ok: true; creadas: number; actualizadas: number }
  | { ok: false; mensaje: string }

/**
 * Importa el parque de un box (EBX-103).
 *
 * Reimportar el mismo fichero corregido actualiza, no duplica ni revienta. Ese es
 * el uso real: se importa lo que se apuntó en la visita, se ve lo que falta, se
 * completa la hoja y se vuelve a importar.
 *
 * Va en dos pasadas, y no en un `upsert` con `onConflict`, porque el índice único
 * del parque es `(cliente_id, lower(nombre))`. Un `ON CONFLICT` de PostgREST solo
 * sabe nombrar columnas, no expresiones, así que no casaría con ese índice. Y el
 * índice tiene que seguir siendo insensible a mayúsculas: en una hoja rellenada a
 * mano, "RowErg 5" y "rowerg 5" son la misma máquina.
 */
export async function importarParque(
  clienteId: string,
  filas: FilaParque[],
): Promise<ResumenImportacion> {
  if (filas.length === 0) {
    return { ok: false, mensaje: 'No hay ninguna fila válida que importar.' }
  }

  const { data: previas, error: errorPrevias } = await supabase
    .from('maquinas')
    .select('id, nombre')
    .eq('cliente_id', clienteId)

  if (errorPrevias) return { ok: false, mensaje: errorPrevias.message }

  const idPorNombre = new Map((previas ?? []).map((m) => [m.nombre.toLowerCase(), m.id]))

  const nuevas = filas.filter((f) => !idPorNombre.has(f.nombre.toLowerCase()))
  const existentes = filas.filter((f) => idPorNombre.has(f.nombre.toLowerCase()))

  if (nuevas.length > 0) {
    const { error } = await supabase.from('maquinas').insert(nuevas.map((f) => comoFila(clienteId, f)))
    const r = resultado(error, 'una máquina')
    if (!r.ok) return { ok: false, mensaje: r.mensaje }
  }

  if (existentes.length > 0) {
    // Con el `id` puesto, el conflicto es contra la clave primaria y el upsert se
    // comporta como la actualización que queremos.
    const { error } = await supabase.from('maquinas').upsert(
      existentes.map((f) => ({
        ...comoFila(clienteId, f),
        id: idPorNombre.get(f.nombre.toLowerCase())!,
      })),
    )
    const r = resultado(error, 'una máquina')
    if (!r.ok) return { ok: false, mensaje: r.mensaje }
  }

  return { ok: true, creadas: nuevas.length, actualizadas: existentes.length }
}
