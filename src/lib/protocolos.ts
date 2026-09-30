import type { TipoMaquina } from '@/lib/database.types'

/**
 * Protocolo de servicio por tipo de máquina (EBX-203).
 *
 * Existe por una razón concreta que está escrita en el parte de la primera
 * visita a un box: «la limpieza de una sola máquina tardó demasiado» y «el
 * procedimiento tiene que estar estructurado o se pierde tiempo». Precargar los
 * pasos es la mitad del valor del sistema — el técnico marca en vez de escribir,
 * y el cliente recibe siempre el mismo informe para el mismo trabajo.
 *
 * Los pasos son cortos a propósito. Se leen de un vistazo, agachado, con el
 * móvil en una mano.
 */

export type Protocolo = {
  /** Lo que se hace siempre. Marcado, entra en el informe. */
  pasos: string[]
  /** Minutos que debería costar. Es el listón contra el que medir la visita. */
  minutosObjetivo: number
}

const REMO: Protocolo = {
  pasos: [
    'Aspirar carcasa y volante',
    'Limpiar y engrasar cadena',
    'Monorraíl y ruedas del asiento',
    'Revisar damper y rejilla',
    'Comprobar reposapiés y correas',
    'Comprobar pila y monitor',
  ],
  minutosObjetivo: 25,
}

const PROTOCOLOS: Record<TipoMaquina, Protocolo> = {
  rowerg: REMO,
  bikeerg: {
    pasos: [
      'Aspirar carcasa y volante',
      'Limpiar y engrasar cadena',
      'Revisar damper y rejilla',
      'Comprobar pedales y correas',
      'Comprobar pila y monitor',
    ],
    minutosObjetivo: 25,
  },
  skierg: {
    pasos: [
      'Abrir caja de cuerdas y limpiar',
      'Revisar cuerdas y empuñaduras',
      'Aspirar carcasa y volante',
      'Revisar damper y rejilla',
      'Repasar estructura y anclajes',
      'Comprobar pila y monitor',
    ],
    minutosObjetivo: 30,
  },
  air_bike: {
    pasos: [
      'Aspirar jaula del ventilador',
      'Revisar holgura en brazos',
      'Tensión de cadena o correa',
      'Apretar tija y manillar',
      'Repasar óxido en estructura',
      'Comprobar consola',
    ],
    minutosObjetivo: 25,
  },
  cinta: {
    pasos: [
      'Aspirar bajo la cinta y el motor',
      'Revisar centrado y tensión',
      'Lubricar tabla si toca',
      'Comprobar parada de emergencia',
    ],
    minutosObjetivo: 30,
  },
  barra: {
    pasos: [
      'Desmontar y limpiar casquillos',
      'Engrasar rodamientos',
      'Cepillar moleteado',
      'Repasar óxido en el eje',
      'Comprobar giro y holgura',
    ],
    minutosObjetivo: 15,
  },
  disco: {
    pasos: ['Limpiar caras y agujero', 'Repasar óxido', 'Comprobar goma o recubrimiento'],
    minutosObjetivo: 10,
  },
  rack: {
    pasos: [
      'Apretar tornillería',
      'Revisar anclajes al suelo o pared',
      'Comprobar pines y ganchos',
      'Repasar óxido',
    ],
    minutosObjetivo: 20,
  },
  otro: {
    pasos: ['Limpieza general', 'Revisión visual', 'Apretar lo que tenga holgura'],
    minutosObjetivo: 20,
  },
}

export function protocoloDe(tipo: TipoMaquina): Protocolo {
  return PROTOCOLOS[tipo]
}

/**
 * El texto del trabajo hecho, tal cual entra en el histórico que ve el cliente.
 *
 * Los pasos marcados van primero y en el orden del protocolo, para que dos
 * informes del mismo tipo de máquina se puedan comparar línea a línea. Lo que se
 * escribe a mano va al final, que es donde se busca lo que se salió del guion.
 */
export function componerTrabajoHecho(pasosMarcados: string[], extra: string | null): string | null {
  const partes = [...pasosMarcados]
  const limpio = extra?.trim()
  if (limpio) partes.push(limpio)
  return partes.length > 0 ? partes.join(' · ') : null
}
