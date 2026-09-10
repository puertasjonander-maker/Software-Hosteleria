import { createClient } from '@/lib/supabase/server'
import type { MomentoFoto, Semaforo, TipoEvento } from '@/lib/database.types'

/**
 * El histórico de una máquina, montado en servidor (EBX-301, EBX-403).
 *
 * Vive aquí y no en la página porque lo piden dos pantallas distintas — la ficha
 * interna y la del cliente — y la diferencia entre ellas tiene que ser el envoltorio,
 * no la consulta. Si cada una armara la suya, tarde o temprano una firmaría una foto
 * que la otra no.
 */

export type FotoHistorico = {
  id: string
  momento: MomentoFoto
  /** URL firmada y caducable. Null si la firma falló: se pinta un hueco, no se rompe. */
  url: string | null
}

export type EventoHistorico = {
  id: string
  fecha: string
  tipo: TipoEvento
  texto: string
  estadoResultante: Semaforo | null
  /** Quién lo firmó. Null para un cliente: no necesita saber qué técnico fue. */
  autor: string | null
  fotos: FotoHistorico[]
}

/** Una hora. Lo que dura mirar un historial, y no más: la URL viaja en el HTML. */
const SEGUNDOS_FIRMA = 3600

/**
 * Firma las rutas del bucket privado.
 *
 * La comprobación de acceso no la hace esta función: la hace Storage al firmar,
 * contra la política `fotos leer`, que cuelga de la misma regla `alcanza_cliente`
 * que el resto. Por eso se firma con el cliente del usuario y nunca con la service
 * role: con la service role firmaríamos cualquier cosa que nos pidieran.
 */
export async function firmarFotos(rutas: string[]): Promise<Map<string, string>> {
  const firmadas = new Map<string, string>()
  if (rutas.length === 0) return firmadas

  const supabase = createClient()
  const { data, error } = await supabase.storage
    .from('fotos')
    .createSignedUrls(rutas, SEGUNDOS_FIRMA)

  if (error || !data) return firmadas

  for (const fila of data) {
    if (fila.signedUrl && fila.path) firmadas.set(fila.path, fila.signedUrl)
  }
  return firmadas
}

/**
 * Carga la línea de tiempo de una máquina.
 *
 * Todas las consultas van con el cliente del usuario, así que la RLS ya ha
 * decidido qué se ve antes de que lleguemos aquí: un cliente que pidiera el
 * histórico de una máquina de otro box recibiría cero eventos, no un error.
 */
export async function cargarHistorico(
  maquinaId: string,
  opciones: { conAutores: boolean; limite?: number },
): Promise<EventoHistorico[]> {
  const supabase = createClient()

  const { data: eventos } = await supabase
    .from('eventos_maquina')
    .select('id, fecha, tipo, texto, estado_resultante, parte_id, autor_id, created_at')
    .eq('maquina_id', maquinaId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(opciones.limite ?? 120)

  if (!eventos || eventos.length === 0) return []

  const parteIds = [...new Set(eventos.map((e) => e.parte_id).filter(Boolean))] as string[]

  const { data: fotos } = parteIds.length
    ? await supabase
        .from('fotos')
        .select('id, parte_id, momento, ruta, orden')
        .in('parte_id', parteIds)
        .order('momento')
        .order('orden')
    : { data: [] }

  const firmadas = await firmarFotos((fotos ?? []).map((f) => f.ruta))

  const porParte = new Map<string, FotoHistorico[]>()
  for (const f of fotos ?? []) {
    const lista = porParte.get(f.parte_id) ?? []
    lista.push({ id: f.id, momento: f.momento, url: firmadas.get(f.ruta) ?? null })
    porParte.set(f.parte_id, lista)
  }

  /*
   * Los nombres de los técnicos solo se piden para una pantalla interna. Para un
   * cliente la política `perfiles` no los devolvería igualmente, así que pedirlos
   * sería un viaje a Supabase para recibir una lista vacía.
   */
  const autores = new Map<string, string>()
  if (opciones.conAutores) {
    const ids = [...new Set(eventos.map((e) => e.autor_id).filter(Boolean))] as string[]
    if (ids.length > 0) {
      const { data: perfiles } = await supabase.from('perfiles').select('id, nombre').in('id', ids)
      for (const p of perfiles ?? []) if (p.nombre) autores.set(p.id, p.nombre)
    }
  }

  return eventos.map((e) => ({
    id: e.id,
    fecha: e.fecha,
    tipo: e.tipo,
    texto: e.texto,
    estadoResultante: e.estado_resultante,
    autor: e.autor_id ? autores.get(e.autor_id) ?? null : null,
    fotos: e.parte_id ? porParte.get(e.parte_id) ?? [] : [],
  }))
}
