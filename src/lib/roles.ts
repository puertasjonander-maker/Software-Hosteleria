import type {
  EstadoServicio,
  RolUsuario,
  Semaforo,
  TipoEvento,
  TipoMaquina,
} from '@/lib/database.types'

/**
 * Helpers de rol y etiquetas de enum, sin dependencias de servidor.
 *
 * Separados de `lib/auth.ts` a propósito: aquel importa `next/headers` y no se
 * puede usar desde un componente de cliente. Estas sí, y las necesita la
 * navegación.
 */

export const ETIQUETA_ROL: Record<RolUsuario, string> = {
  admin: 'Administración',
  tecnico: 'Técnico',
  cliente: 'Cliente',
}

/** Quien trabaja en Ergo Box, frente a quien solo consulta su box. */
export function esInterno(rol: RolUsuario): boolean {
  return rol === 'admin' || rol === 'tecnico'
}

/** Pantalla de inicio según quién entra: cada rol llega a lo suyo. */
export function inicioSegunRol(rol: RolUsuario): string {
  switch (rol) {
    case 'admin':
    case 'tecnico':
      return '/visitas'
    case 'cliente':
      return '/mi-box'
  }
}

// ── Semáforo ─────────────────────────────────────────────────────────────────

export const ETIQUETA_SEMAFORO: Record<Semaforo, string> = {
  verde: 'Correcta',
  ambar: 'Atención',
  rojo: 'Urgente',
  sin_revisar: 'Sin revisar',
}

/**
 * Clases del semáforo. Verde, ámbar y rojo son los tokens semánticos de la
 * interfaz, no colores sueltos; `sin_revisar` es deliberadamente neutro para que
 * no se confunda con "correcta" al mirar el parque de un vistazo.
 */
export const CLASE_SEMAFORO: Record<Semaforo, string> = {
  verde: 'bg-ok text-ok-foreground',
  ambar: 'bg-warn text-warn-foreground',
  rojo: 'bg-destructive text-destructive-foreground',
  sin_revisar: 'bg-muted text-muted-foreground',
}

export const ORDEN_SEMAFORO: Record<Semaforo, number> = {
  rojo: 0,
  ambar: 1,
  sin_revisar: 2,
  verde: 3,
}

// ── Máquinas ─────────────────────────────────────────────────────────────────

export const ETIQUETA_TIPO_MAQUINA: Record<TipoMaquina, string> = {
  rowerg: 'Remo',
  skierg: 'SkiErg',
  bikeerg: 'BikeErg',
  air_bike: 'Air bike',
  cinta: 'Cinta',
  barra: 'Barra',
  disco: 'Discos',
  rack: 'Rack',
  otro: 'Otro',
}

/** El damper y el drag factor solo existen en los Concept2. */
export function admiteDamper(tipo: TipoMaquina): boolean {
  return tipo === 'rowerg' || tipo === 'skierg' || tipo === 'bikeerg'
}

// ── Servicios ────────────────────────────────────────────────────────────────

export const ETIQUETA_ESTADO_SERVICIO: Record<EstadoServicio, string> = {
  planificado: 'Planificada',
  en_curso: 'En curso',
  hecho: 'Terminada',
  cancelado: 'Cancelada',
}

export const ETIQUETA_TIPO_EVENTO: Record<TipoEvento, string> = {
  alta: 'Alta en el parque',
  servicio: 'Servicio',
  cambio_estado: 'Cambio de estado',
  incidencia: 'Incidencia',
  baja: 'Baja',
}
