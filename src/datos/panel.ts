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
  activo: boolean
  resumen: ResumenParque
  peor: Semaforo | null
  visitas: number
}

export type DatosPanel = {
  maquinas: MaquinaFila[]
  clienteDeMaquina: Map<string, string>
  nombreDeBox: Map<string, string>
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
 */
export async function cargarPanel(dias: number): Promise<DatosPanel> {
  const hasta = hoyEnMadrid()
  const desde = restarDias(hasta, dias)

  const [clientes, parque, servicios] = await Promise.all([
    supabase.from('clientes').select('id, nombre, poblacion, activo').order('nombre'),
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

  const maquinas = filasParque.map(comoMaquinaFila)
  const clienteDeMaquina = new Map(filasParque.map((m) => [m.id, m.cliente_id]))
  const nombreDeBox = new Map(filasCliente.map((c) => [c.id, c.nombre]))

  const porBox: BoxEnPanel[] = filasCliente.map((c) => {
    const suyas = maquinas.filter((m) => clienteDeMaquina.get(m.id) === c.id)
    const activas = suyas.filter((m) => m.activa)
    return {
      id: c.id,
      nombre: c.nombre,
      poblacion: c.poblacion,
      activo: c.activo,
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
    resumen: resumirParque(maquinas),
    porBox,
    visitasHechas: filasServicio.filter((s) => s.estado === 'hecho').length,
    visitasAbiertas: filasServicio.filter(
      (s) => s.estado === 'planificado' || s.estado === 'en_curso',
    ).length,
  }
}
