import { supabase } from '@/lib/supabase'
import { oReventar, resultado, traducir, type Resultado } from '@/datos/resultado'
import { protocoloDe } from '@/lib/protocolos'
import type {
  EstadoServicio,
  ParteRow,
  Semaforo,
  TipoMaquina,
} from '@/lib/database.types'

/** Las visitas: planificación y trabajo en campo (fase 2). */

export type VisitaFila = {
  id: string
  clienteId: string
  clienteNombre: string
  fecha: string
  estado: EstadoServicio
  maquinas: number
  hechas: number
}

export type MaquinaParaPlanificar = {
  id: string
  nombre: string
  tipo: TipoMaquina
  estado: Semaforo
  diasHastaRevision: number | null
}

export type BoxParaPlanificar = {
  id: string
  nombre: string
  poblacion: string | null
  maquinas: MaquinaParaPlanificar[]
}

export async function cargarPantallaVisitas(): Promise<{
  visitas: VisitaFila[]
  boxes: BoxParaPlanificar[]
}> {
  const [servicios, partes, clientes, parque] = await Promise.all([
    supabase.from('servicios').select('*').neq('estado', 'cancelado').order('fecha', {
      ascending: false,
    }),
    supabase.from('partes').select('servicio_id, hecho'),
    supabase.from('clientes').select('id, nombre, poblacion').eq('activo', true).order('nombre'),
    supabase
      .from('parque_estado')
      .select('id, cliente_id, nombre, tipo, estado, dias_hasta_revision, activa')
      .order('nombre'),
  ])

  const filas = oReventar(servicios)
  const nombrePorBox = new Map((clientes.data ?? []).map((c) => [c.id, c.nombre]))

  const conteo = new Map<string, { total: number; hechos: number }>()
  for (const p of partes.data ?? []) {
    const actual = conteo.get(p.servicio_id) ?? { total: 0, hechos: 0 }
    actual.total += 1
    if (p.hecho) actual.hechos += 1
    conteo.set(p.servicio_id, actual)
  }

  const visitas: VisitaFila[] = filas.map((s) => {
    const c = conteo.get(s.id) ?? { total: 0, hechos: 0 }
    return {
      id: s.id,
      clienteId: s.cliente_id,
      clienteNombre: nombrePorBox.get(s.cliente_id) ?? 'Box desconocido',
      fecha: s.fecha,
      estado: s.estado,
      maquinas: c.total,
      hechas: c.hechos,
    }
  })

  const boxes: BoxParaPlanificar[] = (clientes.data ?? []).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    poblacion: c.poblacion,
    maquinas: (parque.data ?? [])
      .filter((m) => m.cliente_id === c.id && m.activa)
      .map((m) => ({
        id: m.id,
        nombre: m.nombre,
        tipo: m.tipo,
        estado: m.estado,
        diasHastaRevision: m.dias_hasta_revision,
      })),
  }))

  return { visitas, boxes }
}

export type ParteTrabajo = {
  id: string
  maquinaId: string
  nombre: string
  tipo: TipoMaquina
  marca: string | null
  numSerie: string | null
  ubicacion: string | null
  estadoMaquina: Semaforo
  /** La que tiene hoy la máquina. Es lo que se propone al cerrar el parte. */
  cadenciaMaquinaMeses: number | null
  trabajoHecho: string | null
  piezas: string | null
  estadoAntes: Semaforo | null
  estadoDespues: Semaforo | null
  damper: number | null
  dragFactor: number | null
  minutos: number | null
  cadenciaSugeridaMeses: number | null
  hecho: boolean
}

export type Visita = {
  id: string
  clienteId: string
  clienteNombre: string
  fecha: string
  estado: EstadoServicio
  notas: string | null
  partes: ParteTrabajo[]
}

/*
 * El `select` con relación anidada devuelve la máquina embebida. Se tipa a mano
 * porque `database.types.ts` está escrito sin relaciones: declararlas todas para
 * una consulta sería más ruido que valor.
 */
type ParteConMaquina = ParteRow & {
  maquinas: {
    nombre: string
    tipo: TipoMaquina
    marca: string | null
    num_serie: string | null
    ubicacion: string | null
    estado: Semaforo
    cadencia_meses: number | null
  } | null
}

export async function obtenerVisita(id: string): Promise<Visita> {
  const servicio = oReventar(
    await supabase.from('servicios').select('*').eq('id', id).maybeSingle(),
  )

  const [cliente, partes] = await Promise.all([
    supabase.from('clientes').select('nombre').eq('id', servicio.cliente_id).maybeSingle(),
    supabase
      .from('partes')
      .select('*, maquinas(nombre, tipo, marca, num_serie, ubicacion, estado, cadencia_meses)')
      .eq('servicio_id', id),
  ])

  const lista: ParteTrabajo[] = ((partes.data ?? []) as unknown as ParteConMaquina[])
    .filter((p) => p.maquinas !== null)
    .map((p) => ({
      id: p.id,
      maquinaId: p.maquina_id,
      nombre: p.maquinas!.nombre,
      tipo: p.maquinas!.tipo,
      marca: p.maquinas!.marca,
      numSerie: p.maquinas!.num_serie,
      ubicacion: p.maquinas!.ubicacion,
      estadoMaquina: p.maquinas!.estado,
      cadenciaMaquinaMeses: p.maquinas!.cadencia_meses,
      trabajoHecho: p.trabajo_hecho,
      piezas: p.piezas,
      estadoAntes: p.estado_antes,
      estadoDespues: p.estado_despues,
      damper: p.damper,
      dragFactor: p.drag_factor,
      minutos: p.minutos,
      cadenciaSugeridaMeses: p.cadencia_sugerida_meses,
      hecho: p.hecho,
    }))

  return {
    id: servicio.id,
    clienteId: servicio.cliente_id,
    clienteNombre: cliente.data?.nombre ?? 'Box',
    fecha: servicio.fecha,
    estado: servicio.estado,
    notas: servicio.notas,
    partes: lista,
  }
}

/**
 * Planifica una visita (EBX-201).
 *
 * Se hace con cobertura, antes de salir, y por eso escribe en Postgres de
 * inmediato en vez de pasar por la cola: la visita y sus partes tienen que
 * existir con su id real antes de llegar al box. A partir de ahí el trabajo de
 * campo solo actualiza filas que ya existen, que es lo que permite reintentar sin
 * duplicar.
 *
 * El trabajo previsto de cada parte se rellena aquí desde el protocolo del tipo
 * de máquina. Llegar al box con la lista puesta es la diferencia entre marcar y
 * escribir.
 */
export async function crearVisita(
  clienteId: string,
  fecha: string,
  maquinaIds: string[],
): Promise<{ ok: true; id: string } | { ok: false; mensaje: string }> {
  if (maquinaIds.length === 0) return { ok: false, mensaje: 'Elige al menos una máquina.' }

  const { data: maquinas, error: errorMaquinas } = await supabase
    .from('maquinas')
    .select('id, tipo')
    .eq('cliente_id', clienteId)
    .in('id', maquinaIds)

  if (errorMaquinas) return { ok: false, mensaje: traducir(errorMaquinas.message) }

  // Si alguna máquina no es de este box, la petición viene de una pantalla
  // desincronizada. El trigger lo rechazaría igual, pero aquí se dice claro.
  if (!maquinas || maquinas.length !== maquinaIds.length) {
    return { ok: false, mensaje: 'Alguna máquina ya no está en este box. Recarga la pantalla.' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: servicio, error } = await supabase
    .from('servicios')
    .insert({
      cliente_id: clienteId,
      fecha,
      estado: 'planificado',
      tecnico_id: user?.id ?? null,
      created_by: user?.id ?? null,
    })
    .select('id')
    .single()

  if (error || !servicio) {
    return { ok: false, mensaje: traducir(error?.message ?? 'No se ha podido crear la visita.') }
  }

  const { error: errorPartes } = await supabase.from('partes').insert(
    maquinas.map((m) => ({
      servicio_id: servicio.id,
      maquina_id: m.id,
      trabajo_previsto: protocoloDe(m.tipo as TipoMaquina).pasos.join(' · '),
    })),
  )

  if (errorPartes) {
    // Una visita sin partes no sirve de nada y confunde en la lista. Se deshace.
    await supabase.from('servicios').delete().eq('id', servicio.id)
    return { ok: false, mensaje: traducir(errorPartes.message) }
  }

  return { ok: true, id: servicio.id }
}

export async function cancelarVisita(id: string): Promise<Resultado> {
  const { error } = await supabase.from('servicios').update({ estado: 'cancelado' }).eq('id', id)
  return resultado(error, 'una visita')
}

/** Una máquina que aparece sobre la marcha. Pasa más de lo que parece. */
export async function anadirMaquinaAVisita(
  servicioId: string,
  maquinaId: string,
): Promise<Resultado> {
  const { data: maquina } = await supabase
    .from('maquinas')
    .select('tipo')
    .eq('id', maquinaId)
    .maybeSingle()

  const { error } = await supabase.from('partes').insert({
    servicio_id: servicioId,
    maquina_id: maquinaId,
    trabajo_previsto: maquina ? protocoloDe(maquina.tipo as TipoMaquina).pasos.join(' · ') : null,
  })

  return resultado(error, 'un parte')
}

export async function quitarMaquinaDeVisita(parteId: string): Promise<Resultado> {
  // Solo se quita lo que no se ha hecho: borrar un parte cerrado se llevaría por
  // delante su histórico y sus fotos.
  const { error } = await supabase.from('partes').delete().eq('id', parteId).eq('hecho', false)
  return resultado(error, 'un parte')
}

export async function guardarNotasVisita(id: string, notas: string | null): Promise<Resultado> {
  const { error } = await supabase.from('servicios').update({ notas }).eq('id', id)
  return resultado(error, 'una visita')
}

/** Un trabajo tal y como se resume: el texto y cuántas máquinas lo llevan. */
export type TrabajoDeVisita = { texto: string; veces: number }

export type ResumenUltimaVisita = {
  id: string
  fecha: string
  /** Partes cerrados: las máquinas que de verdad se tocaron. */
  maquinas: number
  trabajos: TrabajoDeVisita[]
  /** Fotos del después, ya firmadas. Pocas y a propósito. */
  fotos: FotoDeParte[]
}

/** Tres miniaturas son una prueba; diez son una galería, y eso ya está en la ficha. */
const FOTOS_RESUMEN = 3

/**
 * La última visita terminada, contada en un bloque (JTBD-3).
 *
 * Existe porque el histórico por máquina, que el cliente ya tiene, no contesta la
 * pregunta que hace al entrar: «¿qué me hicisteis el otro día?». Para saborearlo
 * hay que abrir máquina a máquina, y el trabajo de una tarde queda repartido en
 * doce fichas.
 *
 * Es un resumen, no un historial, y por eso agrupa los trabajos repetidos —en una
 * visita de doce remos el mismo trabajo aparece doce veces— y no trae más de tres
 * fotos. Recortar aquí no oculta nada: el detalle completo sigue a un toque, en la
 * ficha de cada máquina.
 *
 * Para un cliente, la visita y sus partes son las de su box y solo las suyas: el
 * filtro lo pone la RLS.
 */
export async function resumenUltimaVisita(): Promise<ResumenUltimaVisita | null> {
  const { data: servicios } = await supabase
    .from('servicios')
    .select('id, fecha')
    .eq('estado', 'hecho')
    .order('fecha', { ascending: false })
    .limit(1)

  const visita = servicios?.[0]
  if (!visita) return null

  const { data: partes } = await supabase
    .from('partes')
    .select('id, trabajo_hecho')
    .eq('servicio_id', visita.id)
    .eq('hecho', true)

  const filas = partes ?? []

  /*
   * Los trabajos se agrupan por texto: el mismo trabajo en las cinco barras es un
   * trabajo, no cinco líneas. El que más máquinas toca va primero, que es el que
   * cuenta de qué fue la visita.
   */
  const cuenta = new Map<string, number>()
  for (const p of filas) {
    const texto = (p.trabajo_hecho ?? '').trim()
    if (texto === '') continue
    cuenta.set(texto, (cuenta.get(texto) ?? 0) + 1)
  }

  const trabajos: TrabajoDeVisita[] = [...cuenta]
    .map(([texto, veces]) => ({ texto, veces }))
    .sort((a, b) => b.veces - a.veces || a.texto.localeCompare(b.texto, 'es'))

  const fotos = await fotosDelDespues(filas.map((p) => p.id))

  return { id: visita.id, fecha: visita.fecha, maquinas: filas.length, trabajos, fotos }
}

/**
 * Las primeras fotos del después de esos partes, firmadas.
 *
 * Se firman con la sesión de quien mira —igual que el histórico— para que decida
 * la política del bucket y no nosotros. `momento` se filtra también aquí, aunque
 * el `eq` ya lo hace en la consulta, porque un filtro que solo vive en el servidor
 * se pierde en cuanto alguien reutiliza la función con otro `select`.
 */
async function fotosDelDespues(parteIds: string[]): Promise<FotoDeParte[]> {
  if (parteIds.length === 0) return []

  const { data: fotos } = await supabase
    .from('fotos')
    .select('id, momento, ruta')
    .in('parte_id', parteIds)
    .eq('momento', 'despues')
    .order('orden')
    .limit(FOTOS_RESUMEN)

  const delDespues = (fotos ?? []).filter((f) => f.momento === 'despues').slice(0, FOTOS_RESUMEN)
  if (delDespues.length === 0) return []

  const { data: firmadas } = await supabase.storage
    .from('fotos')
    .createSignedUrls(
      delDespues.map((f) => f.ruta),
      3600,
    )

  const urlPorRuta = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]))

  return delDespues
    .map((f) => ({ id: f.id, momento: f.momento, url: urlPorRuta.get(f.ruta) ?? '' }))
    .filter((f) => f.url !== '')
}

export type FotoDeParte = { id: string; momento: 'antes' | 'despues'; url: string }

/**
 * Enlaces firmados de las fotos ya subidas de un parte (EBX-204).
 *
 * Con la sesión del usuario, no con la clave de servicio: así la misma política
 * que protege la tabla decide qué se firma. Si el parte no es alcanzable, la
 * consulta vuelve vacía y no hay nada que firmar.
 */
export async function urlsDeFotos(parteId: string): Promise<FotoDeParte[]> {
  const { data: fotos } = await supabase
    .from('fotos')
    .select('id, momento, ruta')
    .eq('parte_id', parteId)
    .order('momento')
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
