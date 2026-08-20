'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export const ID_RANURA_CABECERA = 'ranura-cabecera'

/**
 * Hueco en la cabecera para los controles que son de una pantalla concreta —
 * hoy, el selector de local de `/pedir`.
 *
 * Existe para que un control global de la pantalla no ocupe una fila propia
 * dentro del contenido. En un móvil de 844 px, esa fila costaba 60 px de los
 * 353 que había por encima del primer producto.
 *
 * El nodo destino lo pinta `Navegacion`, que está por encima en el árbol, así
 * que ya existe cuando este efecto corre. Se resuelve en un efecto y no durante
 * el render porque en el servidor no hay `document`.
 */
export function RanuraCabecera({ children }: { children: React.ReactNode }) {
  const [destino, setDestino] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setDestino(document.getElementById(ID_RANURA_CABECERA))
  }, [])

  if (!destino) return null
  return createPortal(children, destino)
}
