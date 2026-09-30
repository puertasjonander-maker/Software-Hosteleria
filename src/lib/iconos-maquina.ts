import type { TipoMaquina } from '@/lib/database.types'

/**
 * Icono por tipo de máquina.
 *
 * Son dibujos y no iconos de librería a propósito. Un `Bike` genérico no distingue
 * una BikeErg de una bici de aire, y en un box con veinte máquinas de seis clases la
 * lista se lee de un vistazo o no se lee. Aquí cada silueta se reconoce por lo que
 * tiene de particular: la jaula del volante y el raíl del remo, el ventilador con los
 * dos tiradores de la SkiErg, el ventilador enorme de la bici de aire.
 *
 * Se dibujan a mano con las reglas de lucide, que es lo que usa el resto de la
 * aplicación: rejilla de 24, trazo 2, remates redondeados, sin relleno y con
 * `currentColor`. Así se ven como un icono más y heredan tamaño y color.
 *
 * **Pocas formas y grandes.** La primera versión tenía detalle de más y a 20 px —el
 * tamaño de las listas, que es donde se miran— todo era mancha. Un icono de este
 * tamaño no lleva detalle: lleva silueta. De ahí que cada máquina sean tres o cuatro
 * trazos gruesos que ocupan la rejilla entera.
 *
 * Las formas van como datos y no como JSX porque las usan dos sitios: la pantalla
 * (que las pinta con React) y el script que genera la hoja de revisión.
 */
export type Forma =
  | { t: 'path'; d: string }
  | { t: 'circle'; cx: number; cy: number; r: number }

export const ICONOS_MAQUINA: Record<TipoMaquina, Forma[]> = {
  /* Remo: la jaula del volante delante, el raíl hasta el final y el carro encima. */
  rowerg: [
    { t: 'circle', cx: 6.2, cy: 14.6, r: 4.6 },
    { t: 'path', d: 'M2.5 20.4h19' },
    { t: 'path', d: 'M10.6 20.4v-3.2h4v3.2' },
    { t: 'path', d: 'M9.8 10.8l3 1.6' },
  ],

  /*
   * SkiErg: el ventilador arriba, una columna central y los dos tiradores colgando
   * con las asas cruzadas abajo.
   *
   * Con dos columnas gruesas parecía un pingüino —lo dijo la revisión de visión—, así
   * que la columna es una sola y el peso visual se va a las asas horizontales, que es
   * lo que distingue una máquina de esquí: dos tiros que se agarran a la altura de la
   * cadera.
   */
  skierg: [
    { t: 'circle', cx: 12, cy: 5.6, r: 3.6 },
    { t: 'path', d: 'M12 9.2v11.2' },
    { t: 'path', d: 'M9.6 8.4L6 15' },
    { t: 'path', d: 'M14.4 8.4L18 15' },
    { t: 'path', d: 'M4 15h4' },
    { t: 'path', d: 'M16 15h4' },
    { t: 'path', d: 'M7.5 20.4h9' },
  ],

  /* BikeErg: volante abajo delante, asiento detrás, manillar al otro lado. */
  bikeerg: [
    { t: 'circle', cx: 6.8, cy: 15, r: 4.6 },
    { t: 'path', d: 'M6.8 10.4h8' },
    { t: 'path', d: 'M14.8 10.4V7.4' },
    { t: 'path', d: 'M12.6 7.4h4.4' },
    { t: 'path', d: 'M3 8.2h3.4a2 2 0 0 1 2 2' },
    { t: 'path', d: 'M4.4 19.6h12.4' },
  ],

  /*
   * Bici de aire: el ventilador enorme y los dos brazos largos del manillar.
   *
   * Se distingue de la BikeErg por el ventilador —que ocupa un tercio de la rejilla—
   * y porque no hay sillín ni manillar pequeño: solo los dos brazos, que es lo que
   * tiene una bici de aire y no tiene una bici fija.
   */
  air_bike: [
    { t: 'circle', cx: 6.2, cy: 13.6, r: 4.8 },
    { t: 'path', d: 'M10.8 10.4L15.6 3.8' },
    { t: 'path', d: 'M15.6 3.8h3.6' },
    { t: 'path', d: 'M11.4 15.6L17.6 9.2' },
    { t: 'path', d: 'M17.6 9.2V5.8' },
    { t: 'path', d: 'M3.2 20.4h17.6' },
    { t: 'path', d: 'M14.4 20.4v-2.8h3.6v2.8' },
  ],

  /*
   * Cinta: la banda entera abajo, el mástil delante y la consola arriba.
   *
   * Barras horizontales sueltas leían como estantería —también lo dijo la revisión—,
   * así que la banda es un bucle cerrado: es lo que hace que se lea «cinta» y no
   * «escalera».
   */
  cinta: [
    { t: 'path', d: 'M5.8 16.8h10.2a2.3 2.3 0 0 1 0 4.6H5.8a2.3 2.3 0 0 1 0-4.6z' },
    { t: 'path', d: 'M18.3 20.2V9.4' },
    { t: 'path', d: 'M11.6 9.4h6.7' },
    { t: 'path', d: 'M13.4 13.6h5' },
  ],

  /* Barra: el eje completo con los discos grandes dentro y los pequeños fuera. */
  barra: [
    { t: 'path', d: 'M2 12.2h20' },
    { t: 'path', d: 'M5 8.6v7.2' },
    { t: 'path', d: 'M8.2 9.8v4.8' },
    { t: 'path', d: 'M19 8.6v7.2' },
    { t: 'path', d: 'M15.8 9.8v4.8' },
  ],

  /* Discos: el disco de frente, el buje y los agujeros de agarre alrededor. */
  disco: [
    { t: 'circle', cx: 12, cy: 12, r: 7.8 },
    { t: 'circle', cx: 12, cy: 12, r: 2.6 },
    { t: 'circle', cx: 12, cy: 6.4, r: 1 },
    { t: 'circle', cx: 17.6, cy: 12, r: 1 },
    { t: 'circle', cx: 12, cy: 17.6, r: 1 },
    { t: 'circle', cx: 6.4, cy: 12, r: 1 },
  ],

  /* Rack: los montantes, la jaula arriba y una barra CARGADA en los ganchos. */
  rack: [
    { t: 'path', d: 'M6.2 3.6v16.8' },
    { t: 'path', d: 'M17.8 3.6v16.8' },
    { t: 'path', d: 'M6.2 3.6h11.6' },
    { t: 'path', d: 'M4 20.4h16' },
    { t: 'path', d: 'M2.6 9.6h18.8' },
    { t: 'path', d: 'M3.2 7.2v4.8' },
    { t: 'path', d: 'M20.8 7.2v4.8' },
  ],

  /*
   * Otro: una caja.
   *
   * No una mancuerna, que es lo que dibujaba la primera versión: además de competir
   * con «Barra» y «Discos», decía algo falso —una máquina sin clasificar no tiene por
   * qué ser una mancuerna—. Una caja no afirma nada y se lee a cualquier tamaño.
   */
  otro: [
    { t: 'path', d: 'M12 3l8 4.6v8.8L12 21l-8-4.6V7.6z' },
    { t: 'path', d: 'M4 7.6l8 4.6 8-4.6' },
    { t: 'path', d: 'M12 12.2V21' },
  ],
}

/** Las formas del tipo pedido, con la caja de fondo para lo desconocido. */
export function formasDe(tipo: TipoMaquina): Forma[] {
  return ICONOS_MAQUINA[tipo] ?? ICONOS_MAQUINA.otro
}