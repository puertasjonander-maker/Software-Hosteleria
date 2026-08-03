import { cantidad, fecha } from '@/lib/format'

export const NOMBRE_ORG =
  process.env.NEXT_PUBLIC_ORG_NAME ?? 'Next Level Specialty Coffee'

export type LineaMensaje = {
  productName: string
  orderUnit: string
  qtyTotal: number
}

export type DatosMensaje = {
  supplierName: string
  orderDate: string
  expectedDelivery?: string | null
  lines: LineaMensaje[]
  /** Locales a los que va la mercancía, en el orden en que se quiere leer. */
  locationNames: string[]
  contactName?: string | null
  contactPhone?: string | null
  note?: string | null
}

/**
 * Texto plano del pedido (MISE-003).
 *
 * Se manda tal cual por WhatsApp o correo, así que no lleva markdown, ni
 * tabulaciones, ni caracteres que algunos teléfonos rendericen raro. Un
 * proveedor tiene que poder leerlo y servirlo sin preguntar nada.
 */
export function componerMensajePedido(d: DatosMensaje): string {
  const lineas: string[] = []

  lineas.push(`PEDIDO · ${NOMBRE_ORG}`)
  lineas.push(`Proveedor: ${d.supplierName}`)
  lineas.push(`Fecha: ${fecha(d.orderDate)}`)
  if (d.expectedDelivery) {
    lineas.push(`Entrega prevista: ${fecha(d.expectedDelivery)}`)
  }
  lineas.push('')

  for (const l of d.lines) {
    lineas.push(`- ${cantidad(l.qtyTotal)} x ${l.productName} (${l.orderUnit})`)
  }

  lineas.push('')
  if (d.locationNames.length === 1) {
    lineas.push(`Entregar en: ${d.locationNames[0]}`)
  } else if (d.locationNames.length > 1) {
    lineas.push(`Entregar en: ${d.locationNames.join(', ')}`)
  }

  if (d.note?.trim()) {
    lineas.push('')
    lineas.push(d.note.trim())
  }

  lineas.push('')
  const contacto = [d.contactName, d.contactPhone].filter(Boolean).join(' · ')
  lineas.push(`Contacto: ${contacto || NOMBRE_ORG}`)
  lineas.push('Gracias.')

  return lineas.join('\n')
}

/** Deep link de WhatsApp. Sin número, abre el selector de contacto. */
export function enlaceWhatsApp(telefono: string | null | undefined, mensaje: string): string {
  const numero = (telefono ?? '').replace(/[^\d]/g, '')
  const texto = encodeURIComponent(mensaje)
  return numero ? `https://wa.me/${numero}?text=${texto}` : `https://wa.me/?text=${texto}`
}

export function enlaceCorreo(
  destinatario: string | null | undefined,
  asunto: string,
  mensaje: string,
): string {
  return `mailto:${destinatario ?? ''}?subject=${encodeURIComponent(
    asunto,
  )}&body=${encodeURIComponent(mensaje)}`
}
