import { supabase } from '@/lib/supabase'
import { oReventar } from '@/datos/resultado'
import { comoMaquinaFila, peorSemaforo, resumirParque, type MaquinaFila } from '@/lib/parque'
import { hoyEnMadrid } from '@/lib/time'
import type { ResumenParque } from '@/lib/parque'
import type { Semaforo } from '@/lib/database.types'

/** El panel: todos los parques de un vistazo (EBX-304). */

export type BoxEnPanel = {
  id: string
  nombre: string
  poblacion: string | null
  resumen: ResumenParque
  peor: Semaforo | null
  visitas: number
}

/** A quién avisar cuando toca ir a un box. Es lo que convierte una vencida en una llamada. */
export type ContactoBox = {
  nombre: string | null
  telefono: string | null
}

export type DatosPanel = {
  maquinas: MaquinaFila[]
  clienteDeMaquina: Map<string, string>
  nombreDeBox: Map<string, string>
  contactoDeBox: Map<string, ContactoBox>
  resumen: ResumenParque
  porBox: BoxEnPanel[]
  visitasHechas: number
  visitasAbiertas: number
}

/** Resta días a una fecha `aaaa-mm-dd` sin arrastrar zonas horarias. */
export function restarDias(fechaISO: string, dias: number): string {
  const d = new Date(`${fechaISO}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Todo el panel en una llamada.
 *
 * Contesta a tres preguntas en este orden: qué está roto ahora mismo, a qué box
 * hay que ir esta semana, y cuánto se ha trabajado. Las tres se leen del mismo
 * parque, así que se carga una vez y se agrupa aquí en vez de pedir tres
 * consultas agregadas.
 *
 * Solo entran los boxes ACTIVOS, y el filtro se aplica al construir `maquinas` y
 * `porBox`, no al pintar. Es lo que hace que el panel hable de lo que hay: las
 * máquinas de un box dado de baja nunca avisan (`avisos_pendientes()` exige
 * `c.activo`), así que listarlas aquí era prometer una revisión que el sistema no
 * iba a recordar, y encima enterraba lo que sí toca.
 */
export async function cargarPanel(dias: number): Promise<DatosPanel> {
  const hasta = hoyEnMadrid()
  const desde = restarDias(hasta, dias)

  const [clientes, parque, servicios] = await Promise.all([
    supabase
      .from('clientes')
      .select('id, nombre, poblacion, activo, contacto_nombre, contacto_telefono')
      .order('nombre'),
    supabase.from('parque_estado').select('*'),
    supabase
      .from('servicios')
      .select('id, cliente_id, fecha, estado')
      .gte('fecha', desde)
      .lte('fecha', hasta),
  ])

  const filasCliente = oReventar(clientes)
  const filasParque = parque.data ?? []
  const filasServicio = servicios.data ?? []

  const activos = filasCliente.filter((c) => c.activo)
  const idsActivos = new Set(activos.map((c) => c.id))

  // El parque llega sin filtrar por box: el descarte se hace aquí para que no se
  // cuele ni una máquina de un box de baja en el resumen, en el valor ni en las
  // revisiones.
  const maquinas = filasParque
    .filter((m) => idsActivos.has(m.cliente_id))
    .map(comoMaquinaFila)
  const clienteDeMaquina = new Map(filasParque.map((m) => [m.id, m.cliente_id]))
  const nombreDeBox = new Map(filasCliente.map((c) => [c.id, c.nombre]))
  const contactoDeBox = new Map(
    activos.map((c) => [
      c.id,
      { nombre: c.contacto_nombre, telefono: c.contacto_telefono } satisfies ContactoBox,
    ]),
  )

  const porBox: BoxEnPanel[] = activos.map((c) => {
    const suyas = maquinas.filter((m) => clienteDeMaquina.get(m.id) === c.id)
    const activas = suyas.filter((m) => m.activa)
    return {
      id: c.id,
      nombre: c.nombre,
      poblacion: c.poblacion,
      resumen: resumirParque(suyas),
      peor: peorSemaforo(activas.map((m) => m.estado)),
      visitas: filasServicio.filter((s) => s.cliente_id === c.id && s.estado === 'hecho').length,
    }
  })

  /*
   * Un box en rojo por delante de uno en verde, y el que no tiene parque al
   * final: mientras no tenga máquinas no hay nada que decidir sobre él.
   */
  porBox.sort((a, b) => {
    const vacioA = a.resumen.total === 0
    const vacioB = b.resumen.total === 0
    if (vacioA !== vacioB) return vacioA ? 1 : -1

    const urgenciaA = a.resumen.porEstado.rojo * 100 + a.resumen.vencidas
    const urgenciaB = b.resumen.porEstado.rojo * 100 + b.resumen.vencidas
    if (urgenciaA !== urgenciaB) return urgenciaB - urgenciaA

    return a.nombre.localeCompare(b.nombre, 'es')
  })

  return {
    maquinas,
    clienteDeMaquina,
    nombreDeBox,
    contactoDeBox,
    resumen: resumirParque(maquinas),
    porBox,
    visitasHechas: filasServicio.filter((s) => s.estado === 'hecho').length,
    visitasAbiertas: filasServicio.filter(
      (s) => s.estado === 'planificado' || s.estado === 'en_curso',
    ).length,
  }
}
