import type { CanalContacto, UnidadBase } from '@/lib/database.types'
import { leerNumero } from '@/lib/escandallo'

/**
 * Interpretación del CSV de catálogo (MISE-000).
 *
 * El formato es el de `seed/catalogo.demo.csv`: una fila por producto, con los
 * datos del proveedor repetidos. Es redundante a propósito — sale así de un
 * Excel y pedirle al operador que normalice a mano tres hojas relacionadas es
 * pedirle que no lo haga.
 */

export const COLUMNAS_CATALOGO = [
  'proveedor',
  'canal',
  'contacto',
  'dia_pedido',
  'hora_corte',
  'dia_entrega',
  'plazo_dias',
  'producto',
  'categoria',
  'unidad_pedido',
  'unidad_base',
  'unidades_por_pedido',
  'ultimo_precio',
  'locales',
] as const

export type FilaCatalogo = {
  proveedor: string
  canal: CanalContacto
  contacto: string
  diaPedido: number | null
  horaCorte: string | null
  diaEntrega: number | null
  plazoDias: number
  producto: string
  categoria: string
  unidadPedido: string
  unidadBase: UnidadBase
  unidadesPorPedido: number
  ultimoPrecio: number | null
  /** Nombres de local, o `null` cuando la fila dice "todos". */
  locales: string[] | null
}

export type ProblemaFila = { fila: number; motivo: string }

const CANALES: Record<string, CanalContacto> = {
  whatsapp: 'whatsapp',
  wa: 'whatsapp',
  email: 'email',
  correo: 'email',
  telefono: 'telefono',
  teléfono: 'telefono',
  tel: 'telefono',
}

const UNIDADES_BASE: Record<string, UnidadBase> = {
  kg: 'kg',
  l: 'l',
  ud: 'ud',
  unidad: 'ud',
  litro: 'l',
  kilo: 'kg',
}

function texto(valor: unknown): string {
  return String(valor ?? '').trim()
}

function diaSemana(valor: unknown): number | null {
  const numero = leerNumero(valor)
  if (numero === null) return null
  const entero = Math.round(numero)
  return entero >= 0 && entero <= 6 ? entero : null
}

/** Acepta '11:00' y '11:00:00'; devuelve siempre 'HH:MM:SS' para Postgres. */
function hora(valor: unknown): string | null {
  const bruto = texto(valor)
  const coincide = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(bruto)
  if (!coincide) return null

  const h = Number(coincide[1])
  const m = Number(coincide[2])
  if (h > 23 || m > 59) return null

  return `${String(h).padStart(2, '0')}:${coincide[2]}:${coincide[3] ?? '00'}`
}

export function interpretarCatalogo(filas: Record<string, unknown>[]): {
  validas: FilaCatalogo[]
  problemas: ProblemaFila[]
} {
  const validas: FilaCatalogo[] = []
  const problemas: ProblemaFila[] = []

  filas.forEach((fila, indice) => {
    const numeroFila = indice + 2 // cabecera incluida, como se ve en el Excel

    const proveedor = texto(fila.proveedor)
    const producto = texto(fila.producto)

    // Fila completamente vacía: ni dato ni error.
    if (!proveedor && !producto) return

    // Los errores se acumulan por fila y no cortan la importación: MISE-000 pide
    // "errores por fila, no como fallo global".
    if (!proveedor) {
      problemas.push({ fila: numeroFila, motivo: 'Sin proveedor' })
      return
    }
    if (!producto) {
      problemas.push({ fila: numeroFila, motivo: `Sin nombre de producto (${proveedor})` })
      return
    }

    const unidadPedido = texto(fila.unidad_pedido)
    if (!unidadPedido) {
      problemas.push({ fila: numeroFila, motivo: `"${producto}" no tiene unidad de pedido` })
      return
    }

    const unidadBase = UNIDADES_BASE[texto(fila.unidad_base).toLowerCase()]
    if (!unidadBase) {
      problemas.push({
        fila: numeroFila,
        motivo: `"${producto}": unidad base "${texto(fila.unidad_base)}" no es kg, l ni ud`,
      })
      return
    }

    const factor = leerNumero(fila.unidades_por_pedido)
    if (factor === null || factor <= 0) {
      problemas.push({
        fila: numeroFila,
        motivo: `"${producto}": unidades por unidad de pedido no válidas`,
      })
      return
    }

    const canal = CANALES[texto(fila.canal).toLowerCase()] ?? 'whatsapp'
    const precio = leerNumero(fila.ultimo_precio)
    const localesTexto = texto(fila.locales)

    validas.push({
      proveedor,
      canal,
      contacto: texto(fila.contacto),
      diaPedido: diaSemana(fila.dia_pedido),
      horaCorte: hora(fila.hora_corte),
      diaEntrega: diaSemana(fila.dia_entrega),
      plazoDias: Math.max(0, Math.round(leerNumero(fila.plazo_dias) ?? 1)),
      producto,
      categoria: texto(fila.categoria) || 'sin categoría',
      unidadPedido,
      unidadBase,
      unidadesPorPedido: factor,
      ultimoPrecio: precio !== null && precio >= 0 ? precio : null,
      locales:
        localesTexto === '' || localesTexto.toLowerCase() === 'todos'
          ? null
          : localesTexto
              .split(';')
              .map((n) => n.trim())
              .filter(Boolean),
    })
  })

  return { validas, problemas }
}
