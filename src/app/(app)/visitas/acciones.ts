'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { protocoloDe } from '@/lib/protocolos'
import type { TipoMaquina } from '@/lib/database.types'

export type Resultado = { ok: true; id?: string } | { ok: false; mensaje: string }

function traducir(mensaje: string): string {
  if (mensaje.includes('row-level security')) return 'Tu usuario no tiene permiso para esto.'
  if (mensaje.includes('duplicate key')) return 'Esa máquina ya está en la visita.'
  if (mensaje.includes('no pertenece al box')) {
    return 'Esa máquina no es de este box. Recarga la pantalla.'
  }
  return mensaje
}

/**
 * Planifica una visita (EBX-201).
 *
 * Se hace con cobertura, antes de salir, y por eso va contra el servidor en vez
 * de por la cola: la visita y sus partes tienen que existir en Postgres con su
 * id real antes de llegar al box. A partir de ahí el trabajo de campo solo
 * actualiza filas que ya existen, que es lo que permite reintentar sin duplicar.
 *
 * El trabajo previsto de cada parte se rellena aquí desde el protocolo del tipo
 * de máquina. Llegar al box con la lista puesta es la diferencia entre marcar y
 * escribir.
 */
export async function crearVisita(
  clienteId: string,
  fecha: string,
  maquinaIds: string[],
): Promise<Resultado> {
  if (maquinaIds.length === 0) {
    return { ok: false, mensaje: 'Elige al menos una máquina.' }
  }

  const supabase = createClient()

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

  revalidatePath('/visitas')
  return { ok: true, id: servicio.id }
}

export async function cancelarVisita(id: string): Promise<Resultado> {
  const supabase = createClient()
  const { error } = await supabase
    .from('servicios')
    .update({ estado: 'cancelado' })
    .eq('id', id)

  revalidatePath('/visitas')
  revalidatePath(`/visitas/${id}`)
  return error ? { ok: false, mensaje: traducir(error.message) } : { ok: true }
}

/** Una máquina que aparece sobre la marcha. Pasa más de lo que parece. */
export async function anadirMaquina(servicioId: string, maquinaId: string): Promise<Resultado> {
  const supabase = createClient()

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

  revalidatePath(`/visitas/${servicioId}`)
  return error ? { ok: false, mensaje: traducir(error.message) } : { ok: true }
}

export async function quitarMaquina(servicioId: string, parteId: string): Promise<Resultado> {
  const supabase = createClient()
  // Solo se quita lo que no se ha hecho: borrar un parte cerrado se llevaría por
  // delante su histórico y sus fotos.
  const { error } = await supabase
    .from('partes')
    .delete()
    .eq('id', parteId)
    .eq('hecho', false)

  revalidatePath(`/visitas/${servicioId}`)
  return error ? { ok: false, mensaje: traducir(error.message) } : { ok: true }
}

export async function guardarNotasVisita(id: string, notas: string | null): Promise<Resultado> {
  const supabase = createClient()
  const { error } = await supabase.from('servicios').update({ notas }).eq('id', id)

  revalidatePath(`/visitas/${id}`)
  return error ? { ok: false, mensaje: traducir(error.message) } : { ok: true }
}

// ── Fotos ────────────────────────────────────────────────────────────────────

export type FotoServidor = { id: string; momento: 'antes' | 'despues'; url: string }

/**
 * Enlaces firmados de las fotos ya subidas de un parte (EBX-204).
 *
 * En servidor y con la sesión del usuario, no con la service role key: así la
 * misma política que protege la tabla decide qué se firma. Si el parte no es
 * alcanzable, la consulta vuelve vacía y no hay nada que firmar.
 *
 * Caducan en una hora. El bucket es privado y no existe ninguna URL pública.
 */
export async function urlsDeFotos(parteId: string): Promise<FotoServidor[]> {
  const supabase = createClient()

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
