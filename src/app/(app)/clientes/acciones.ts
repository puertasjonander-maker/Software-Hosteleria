'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Semaforo, TipoEvento, TipoMaquina } from '@/lib/database.types'
import type { FilaParque } from '@/lib/parque'
import { TIPOS_ANOTABLES } from '@/lib/roles'

export type Resultado = { ok: true } | { ok: false; mensaje: string }

/**
 * Traducción de errores de Postgres a algo que se pueda leer sin ser de aquí.
 *
 * El caso de RLS merece mención: cuando una política deniega una escritura, el
 * mensaje que llega es "new row violates row-level security policy". Es correcto
 * y es inútil para quien lo lee.
 */
function resultado(error: { message: string } | null, contexto: string): Resultado {
  if (!error) return { ok: true }

  if (error.message.includes('duplicate key')) {
    return { ok: false, mensaje: `Ya existe ${contexto} con ese nombre.` }
  }
  if (error.message.includes('row-level security')) {
    return { ok: false, mensaje: 'Tu usuario no tiene permiso para esto.' }
  }
  if (error.message.includes('cadencia_meses')) {
    return { ok: false, mensaje: 'La cadencia tiene que estar entre 1 y 36 meses.' }
  }
  return { ok: false, mensaje: error.message }
}

// ── Boxes ────────────────────────────────────────────────────────────────────

export type DatosCliente = {
  nombre: string
  direccion: string | null
  poblacion: string | null
  contactoNombre: string | null
  contactoTelefono: string | null
  contactoEmail: string | null
  notas: string | null
  activo: boolean
}

export async function guardarCliente(id: string | null, datos: DatosCliente): Promise<Resultado> {
  const supabase = createClient()

  const fila = {
    nombre: datos.nombre,
    direccion: datos.direccion,
    poblacion: datos.poblacion,
    contacto_nombre: datos.contactoNombre,
    contacto_telefono: datos.contactoTelefono,
    contacto_email: datos.contactoEmail,
    notas: datos.notas,
    activo: datos.activo,
  }

  const { error } = id
    ? await supabase.from('clientes').update(fila).eq('id', id)
    : await supabase.from('clientes').insert(fila)

  revalidatePath('/clientes')
  if (id) revalidatePath(`/clientes/${id}`)
  return resultado(error, 'un box')
}

// ── Máquinas ─────────────────────────────────────────────────────────────────

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

export async function guardarMaquina(
  clienteId: string,
  id: string | null,
  datos: DatosMaquina,
): Promise<Resultado> {
  const supabase = createClient()

  const fila = {
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

  const { error } = id
    ? await supabase.from('maquinas').update(fila).eq('id', id)
    : await supabase.from('maquinas').insert(fila)

  revalidatePath(`/clientes/${clienteId}`)
  return resultado(error, 'una máquina')
}

/**
 * Una máquina se desactiva, no se borra.
 *
 * Borrarla se llevaría por delante su histórico y sus fotos, que es justo la
 * prueba del trabajo cobrado. Una máquina que sale del box queda inactiva y su
 * ficha se sigue pudiendo consultar.
 */
export async function alternarMaquina(
  clienteId: string,
  id: string,
  activa: boolean,
): Promise<Resultado> {
  const supabase = createClient()
  const { error } = await supabase.from('maquinas').update({ activa }).eq('id', id)

  revalidatePath(`/clientes/${clienteId}`)
  return resultado(error, 'una máquina')
}

// ── Histórico ────────────────────────────────────────────────────────────────

export type DatosEvento = {
  fecha: string
  tipo: TipoEvento
  texto: string
  /** Null = la anotación no toca el semáforo. */
  estadoResultante: Semaforo | null
}

/**
 * Añade una línea al histórico de una máquina.
 *
 * Es para lo que no viene de una visita: "llegó con óxido de fábrica", "se la
 * llevaron a una competición". Anotar no mueve el semáforo de la máquina: si
 * además hay que cambiarlo, se cambia en la ficha, y ese cambio deja su propia
 * línea. Mezclar las dos cosas haría que corregir una fecha mal escrita
 * repintara el parque.
 */
export async function anotarEvento(
  clienteId: string,
  maquinaId: string,
  datos: DatosEvento,
): Promise<Resultado> {
  const texto = datos.texto.trim()
  if (texto === '') return { ok: false, mensaje: 'Escribe qué pasó.' }
  if (!TIPOS_ANOTABLES.includes(datos.tipo)) {
    return { ok: false, mensaje: 'Ese tipo de evento no se anota a mano.' }
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.from('eventos_maquina').insert({
    maquina_id: maquinaId,
    fecha: datos.fecha,
    tipo: datos.tipo,
    texto,
    estado_resultante: datos.estadoResultante,
    autor_id: user?.id ?? null,
  })

  revalidatePath(`/clientes/${clienteId}/maquinas/${maquinaId}`)
  return resultado(error, 'un evento')
}

// ── Importación del parque ───────────────────────────────────────────────────

export type ResumenParque =
  | { ok: true; creadas: number; actualizadas: number }
  | { ok: false; mensaje: string }

/**
 * Importa el parque de un box (EBX-103).
 *
 * Reimportar el mismo fichero corregido actualiza, no duplica ni revienta. Ese
 * es el uso real: se importa lo que se apuntó en la visita, se ve lo que falta
 * (en IronBuster faltaban la mitad de los números de serie), se completa la hoja
 * y se vuelve a importar.
 *
 * Va en dos pasadas, y no en un `upsert` con `onConflict`, porque el índice
 * único del parque es `(cliente_id, lower(nombre))`. Un `ON CONFLICT` de
 * PostgREST solo sabe nombrar columnas, no expresiones, así que no casaría con
 * ese índice. Y el índice tiene que seguir siendo insensible a mayúsculas: en
 * una hoja rellenada a mano, "RowErg 5" y "rowerg 5" son la misma máquina.
 */
export async function importarParque(
  clienteId: string,
  filas: FilaParque[],
): Promise<ResumenParque> {
  if (filas.length === 0) return { ok: false, mensaje: 'No hay ninguna fila válida que importar.' }

  const supabase = createClient()

  const { data: previas, error: errorPrevias } = await supabase
    .from('maquinas')
    .select('id, nombre')
    .eq('cliente_id', clienteId)

  if (errorPrevias) return { ok: false, mensaje: errorPrevias.message }

  const idPorNombre = new Map((previas ?? []).map((m) => [m.nombre.toLowerCase(), m.id]))

  const comoFila = (f: FilaParque) => ({
    cliente_id: clienteId,
    nombre: f.nombre,
    tipo: f.tipo,
    marca: f.marca,
    modelo: f.modelo,
    num_serie: f.numSerie,
    ubicacion: f.ubicacion,
    estado: f.estado,
    cadencia_meses: f.cadenciaMeses,
    ultima_revision: f.ultimaRevision,
    notas: f.notas,
  })

  const nuevas = filas.filter((f) => !idPorNombre.has(f.nombre.toLowerCase()))
  const existentes = filas.filter((f) => idPorNombre.has(f.nombre.toLowerCase()))

  if (nuevas.length > 0) {
    const { error } = await supabase.from('maquinas').insert(nuevas.map(comoFila))
    if (error) {
      const traducido = resultado(error, 'una máquina')
      return { ok: false, mensaje: traducido.ok ? '' : traducido.mensaje }
    }
  }

  if (existentes.length > 0) {
    // Con el `id` puesto, el conflicto es contra la clave primaria y el upsert
    // se comporta como la actualización que queremos.
    const { error } = await supabase.from('maquinas').upsert(
      existentes.map((f) => ({ ...comoFila(f), id: idPorNombre.get(f.nombre.toLowerCase())! })),
    )
    if (error) {
      const traducido = resultado(error, 'una máquina')
      return { ok: false, mensaje: traducido.ok ? '' : traducido.mensaje }
    }
  }

  revalidatePath(`/clientes/${clienteId}`)
  return { ok: true, creadas: nuevas.length, actualizadas: existentes.length }
}
