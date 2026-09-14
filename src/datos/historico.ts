import { supabase } from '@/lib/supabase'
import { resultado, type Resultado } from '@/datos/resultado'
import { TIPOS_ANOTABLES } from '@/lib/roles'
import type { MomentoFoto, Semaforo, TipoEvento } from '@/lib/database.types'

/**
 * El histórico de una máquina (EBX-301, EBX-302, EBX-403).
 *
 * Lo piden dos pantallas distintas —la ficha interna y la del cliente— y la
 * diferencia entre ellas tiene que ser el envoltorio, no la consulta. Si cada una
 * armara la suya, tarde o temprano una firmaría una foto que la otra no.
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

/** Una hora. Lo que dura mirar un historial, y no más. */
const SEGUNDOS_FIRMA = 3600

/**
 * Firma rutas del bucket privado (EBX-403).
 *
 * La comprobación de acceso no la hace esta función: la hace Storage al firmar,
 * contra la política `fotos leer`, que cuelga de la misma regla `alcanza_cliente`
 * que el resto. Por eso se firma con la sesión de quien mira y nunca con la clave
 * de servicio, que no está en esta aplicación.
 *
 * Que esto ocurra ahora en el navegador no cambia nada: el token que viaja es el
 * del usuario, igual que cuando lo hacía un servidor en su nombre.
 */
export async function firmarFotos(rutas: string[]): Promise<Map<string, string>> {
  const firmadas = new Map<string, string>()
  if (rutas.length === 0) return firmadas

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
 * La línea de tiempo de una máquina.
 *
 * La RLS ya ha decidido qué se ve antes de que lleguemos aquí: un cliente que
 * pidiera el histórico de una máquina de otro box recibiría cero eventos.
 */
export async function cargarHistorico(
  maquinaId: string,
  opciones: { conAutores: boolean; limite?: number },
): Promise<EventoHistorico[]> {
  const { data: eventos } = await supabase
    .from('eventos_maquina')
    .select('id, fecha, tipo, texto, estado_resultante, parte_id, autor_id, created_at')
    .eq('maquina_id', maquinaId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(opciones.limite ?? 120)

  if (!eventos || eventos.length === 0) return []

  const parteIds = [...new Set(eventos.map((e) => e.parte_id).filter(Boolean))] as string[]

  /*
   * Dos consultas y no una: las fotos de los partes cuelgan de un parte, y las
   * del inventario cuelgan de la máquina. Se piden a la vez para no encadenar dos
   * viajes, y se firman todas juntas en una sola llamada.
   */
  const [deIPartes, deMaquina] = await Promise.all([
    parteIds.length
      ? supabase
          .from('fotos')
          .select('id, parte_id, momento, ruta, orden')
          .in('parte_id', parteIds)
          .order('momento')
          .order('orden')
      : Promise.resolve({ data: [] }),
    supabase
      .from('fotos')
      .select('id, parte_id, momento, ruta, orden')
      .eq('maquina_id', maquinaId)
      .order('orden'),
  ])

  const fotos = deIPartes.data ?? []
  const fotosDelAlta = deMaquina.data ?? []

  const firmadas = await firmarFotos([...fotos, ...fotosDelAlta].map((f) => f.ruta))

  const porParte = new Map<string, FotoHistorico[]>()
  for (const f of fotos) {
    // El filtro `in('parte_id', …)` garantiza que aquí no hay nulos, pero el tipo
    // ya no lo sabe: desde que una foto puede colgar de una máquina, `parte_id`
    // es opcional. Se comprueba en vez de forzarlo.
    if (!f.parte_id) continue
    const lista = porParte.get(f.parte_id) ?? []
    lista.push({ id: f.id, momento: f.momento, url: firmadas.get(f.ruta) ?? null })
    porParte.set(f.parte_id, lista)
  }

  /*
   * Las del inventario se cuelgan del alta, que es el evento que cuenta cómo
   * llegó la máquina. Es el único sitio donde tienen sentido: enseñar «cómo
   * estaba antes de tocarla» al lado de un servicio de hace dos meses confundiría
   * las dos cosas.
   */
  const delAlta: FotoHistorico[] = fotosDelAlta.map((f) => ({
    id: f.id,
    momento: f.momento,
    url: firmadas.get(f.ruta) ?? null,
  }))

  /*
   * Los nombres de los técnicos solo se piden para una pantalla interna. Para un
   * cliente la política de `perfiles` no los devolvería igualmente, así que
   * pedirlos sería un viaje a Supabase para recibir una lista vacía.
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
    fotos: e.parte_id ? porParte.get(e.parte_id) ?? [] : e.tipo === 'alta' ? delAlta : [],
  }))
}

export type DatosEvento = {
  fecha: string
  tipo: TipoEvento
  texto: string
  /** Null = la anotación no toca el semáforo. */
  estadoResultante: Semaforo | null
}

/**
 * Añade una línea al histórico de una máquina (EBX-302).
 *
 * Es para lo que no viene de una visita: "llegó con óxido de fábrica", "se la
 * llevaron a una competición". Anotar no mueve el semáforo de la máquina: si
 * además hay que cambiarlo, se cambia en la ficha, y ese cambio deja su propia
 * línea. Mezclar las dos cosas haría que corregir una fecha mal escrita
 * repintara el parque.
 *
 * Las comprobaciones que importan están en la base de datos, en
 * `validar_evento_manual()`: que el tipo no sea `servicio`, que el parte sea de
 * esta máquina y que la máquina se alcance. Las de aquí solo evitan el viaje.
 */
export async function anotarEvento(maquinaId: string, datos: DatosEvento): Promise<Resultado> {
  const texto = datos.texto.trim()
  if (texto === '') return { ok: false, mensaje: 'Escribe qué pasó.' }
  if (!TIPOS_ANOTABLES.includes(datos.tipo)) {
    return { ok: false, mensaje: 'Ese tipo de evento no se anota a mano.' }
  }

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

  return resultado(error, 'un evento')
}
