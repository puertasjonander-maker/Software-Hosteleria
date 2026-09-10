import { supabase } from '@/lib/supabase'
import { oReventar, resultado, type Resultado } from '@/datos/resultado'
import { peorSemaforo } from '@/lib/parque'
import { hoyEnMadrid } from '@/lib/time'
import type { ClienteRow, Semaforo } from '@/lib/database.types'

/** Los boxes: alta, listado y ficha (EBX-101). */

export type BoxResumen = {
  id: string
  nombre: string
  poblacion: string | null
  contactoNombre: string | null
  activo: boolean
  maquinas: number
  peor: Semaforo | null
  vencidas: number
}

/**
 * Listado con el semáforo de cada parque.
 *
 * Dos consultas y el cruce aquí, en vez de una vista agregada: son decenas de
 * máquinas, no millones, y una vista más sería otra cosa que mantener en el
 * esquema cada vez que cambie lo que enseña esta pantalla.
 */
export async function listarBoxes(): Promise<BoxResumen[]> {
  const [clientes, maquinas] = await Promise.all([
    supabase.from('clientes').select('*').order('nombre'),
    supabase.from('maquinas').select('cliente_id, estado, activa, proxima_revision'),
  ])

  const filas = oReventar(clientes)
  const hoy = hoyEnMadrid()

  const porBox = new Map<string, { estados: Semaforo[]; vencidas: number }>()
  for (const m of maquinas.data ?? []) {
    if (!m.activa) continue
    const actual = porBox.get(m.cliente_id) ?? { estados: [], vencidas: 0 }
    actual.estados.push(m.estado)
    if (m.proxima_revision && m.proxima_revision <= hoy) actual.vencidas += 1
    porBox.set(m.cliente_id, actual)
  }

  return filas.map((c) => {
    const agregado = porBox.get(c.id) ?? { estados: [], vencidas: 0 }
    return {
      id: c.id,
      nombre: c.nombre,
      poblacion: c.poblacion,
      contactoNombre: c.contacto_nombre,
      activo: c.activo,
      maquinas: agregado.estados.length,
      peor: peorSemaforo(agregado.estados),
      vencidas: agregado.vencidas,
    }
  })
}

export async function obtenerBox(id: string): Promise<ClienteRow> {
  return oReventar(await supabase.from('clientes').select('*').eq('id', id).maybeSingle())
}

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

export async function guardarBox(id: string | null, datos: DatosCliente): Promise<Resultado> {
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

  return resultado(error, 'un box')
}
