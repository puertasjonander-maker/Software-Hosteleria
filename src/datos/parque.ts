import { supabase } from '@/lib/supabase'
import { oReventar, resultado, type Resultado } from '@/datos/resultado'
import { comoMaquinaFila, type FilaParque, type MaquinaFila } from '@/lib/parque'
import type { Semaforo, TipoMaquina } from '@/lib/database.types'
import type { FotoSubida } from '@/lib/foto'

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

/**
 * Una máquina, con el box al que pertenece.
 *
 * El `clienteId` no es cosmético: sin él, `/boxes/<box A>/maquinas/<máquina de
 * B>` pintaba la ficha de B bajo la cabecera de A y, al guardar, `guardarMaquina`
 * reescribía el `cliente_id` — la máquina cambiaba de box sin que nadie lo
 * pidiera. No es una fuga (un interno ve los dos boxes), es el dato mal puesto.
 */
export async function obtenerMaquina(id: string, clienteId?: string): Promise<MaquinaFila> {
  const consulta = supabase.from('parque_estado').select('*').eq('id', id)
  const porBox = clienteId ? consulta.eq('cliente_id', clienteId) : consulta

  return comoMaquinaFila(oReventar(await porBox.maybeSingle()))
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

/**
 * Enlaces firmados de las fotos de inventario de una máquina.
 *
 * Son las que cuelgan de la máquina y no de ningún parte: las de cómo llegó. Se
 * firman con la sesión de quien pregunta, igual que las de un parte, así que la
 * misma política que protege la tabla decide qué se firma. Si la máquina no es
 * alcanzable, la consulta vuelve vacía y no hay nada que firmar.
 */
export async function urlsFotosDeMaquina(maquinaId: string): Promise<FotoSubida[]> {
  const { data: fotos } = await supabase
    .from('fotos')
    .select('id, momento, ruta')
    .eq('maquina_id', maquinaId)
    .order('orden')

  if (!fotos || fotos.length === 0) return []

  const { data: firmadas } = await supabase.storage
    .from('fotos')
    .createSignedUrls(
      fotos.map((f) => f.ruta),
      3600,
    )

  const urlPorRuta = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]))

  return fotos
    .map((f) => ({ id: f.id, momento: f.momento, url: urlPorRuta.get(f.ruta) ?? '' }))
    .filter((f) => f.url !== '')
}

// ── Importar desde Notion (EBX-106) ──────────────────────────────────────────

export type LecturaNotion =
  | { ok: true; filas: Record<string, unknown>[]; leidas: number }
  | { ok: false; mensaje: string; sinConfigurar: boolean }

/**
 * Lee el parque de un box desde su base de Notion.
 *
 * Devuelve las filas en crudo, con las mismas claves que un CSV de la plantilla,
 * y aquí se acaba lo especial de Notion: a partir de este punto pasan por
 * `interpretarParque()` y por `importarParque()` igual que un fichero. Un solo
 * camino de escritura, y es el que ya está probado.
 */
export async function leerParqueDeNotion(base: string): Promise<LecturaNotion> {
  const { data, error } = await supabase.functions.invoke<{
    filas?: Record<string, unknown>[]
    leidas?: number
    error?: string
    codigo?: string
  }>('importar-notion', { body: { base } })

  if (error) {
    // `invoke` deja el cuerpo del error en `context`, no en el mensaje. Sin
    // leerlo, cualquier fallo se vería como "non-2xx status" y no diría nada.
    const contexto = (error as { context?: unknown }).context
    if (contexto instanceof Response) {
      try {
        const cuerpo = await contexto.json()
        return {
          ok: false,
          mensaje: typeof cuerpo?.error === 'string' ? cuerpo.error : error.message,
          sinConfigurar: cuerpo?.codigo === 'sin_configurar',
        }
      } catch {
        /* cuerpo ilegible: se cae al mensaje de abajo */
      }
    }
    return { ok: false, mensaje: error.message, sinConfigurar: false }
  }

  if (!data || data.error) {
    return {
      ok: false,
      mensaje: data?.error ?? 'No ha funcionado.',
      sinConfigurar: data?.codigo === 'sin_configurar',
    }
  }

  return { ok: true, filas: data.filas ?? [], leidas: data.leidas ?? 0 }
}
