import type { RolUsuario } from '@/lib/database.types'

/**
 * Helpers de rol sin dependencias de servidor.
 *
 * Separados de `lib/auth.ts` a propósito: aquel importa `next/headers` y no se
 * puede usar desde un componente de cliente. Estas cuatro cosas sí, y las
 * necesita la navegación.
 */

export const ETIQUETA_ROL: Record<RolUsuario, string> = {
  barista: 'Barista',
  encargado: 'Encargado',
  operador: 'Operador',
}

export function esGestor(rol: RolUsuario): boolean {
  return rol === 'encargado' || rol === 'operador'
}

/** Pantalla de inicio según quién entra: cada rol llega a lo suyo. */
export function inicioSegunRol(rol: RolUsuario): string {
  switch (rol) {
    case 'barista':
      return '/pedir'
    case 'encargado':
      return '/pedidos'
    case 'operador':
      return '/panel'
  }
}

export const ETIQUETA_INCIDENCIA = {
  ninguna: 'Sin incidencia',
  falta: 'Falta',
  danado: 'Dañado',
  precio_distinto: 'Precio distinto',
  sustituido: 'Sustituido',
} as const

export const ETIQUETA_ESTADO_PEDIDO = {
  borrador: 'Borrador',
  enviado: 'Enviado',
  recibido_parcial: 'Recibido en parte',
  cerrado: 'Cerrado',
} as const

export const ETIQUETA_CANAL = {
  whatsapp: 'WhatsApp',
  email: 'Correo',
  telefono: 'Teléfono',
} as const
