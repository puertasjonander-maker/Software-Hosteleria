'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type Caja = { left: number; width: number }

/**
 * Mide dónde está el elemento activo dentro de un contenedor para poder mover
 * un indicador hasta él.
 *
 * Antes, cambiar de pestaña solo cambiaba un color: el indicador aparecía en el
 * destino sin haber estado nunca en el origen. Un raíl que viaja los 104 px que
 * hay entre dos pestañas explica de dónde vienes, y cuesta 200 ms.
 *
 * Cada elemento marcable lleva `data-indicador="<clave>"`.
 */
export function useIndicador<T extends HTMLElement>(claveActiva: string | null) {
  const contenedor = useRef<T | null>(null)
  const [caja, setCaja] = useState<Caja | null>(null)
  // Hasta el primer sitio medido no hay transición: si no, el indicador
  // entraría deslizándose desde el borde izquierdo en cada carga.
  const [animable, setAnimable] = useState(false)

  const medir = useCallback(() => {
    const raiz = contenedor.current
    if (!raiz || !claveActiva) {
      setCaja(null)
      return
    }

    const activo = raiz.querySelector<HTMLElement>(
      `[data-indicador="${CSS.escape(claveActiva)}"]`,
    )
    if (!activo) {
      setCaja(null)
      return
    }

    const base = raiz.getBoundingClientRect()
    const destino = activo.getBoundingClientRect()
    setCaja({ left: destino.left - base.left, width: destino.width })
  }, [claveActiva])

  useLayoutEffect(() => {
    medir()
  }, [medir])

  useEffect(() => {
    // Un segundo fotograma: el ancho de las pestañas depende del texto, y el
    // texto depende de una fuente que puede no haber terminado de cargar.
    const frame = requestAnimationFrame(() => {
      medir()
      setAnimable(true)
    })

    const observador = new ResizeObserver(medir)
    if (contenedor.current) observador.observe(contenedor.current)

    return () => {
      cancelAnimationFrame(frame)
      observador.disconnect()
    }
  }, [medir])

  return { contenedor, caja, animable }
}

/**
 * El indicador en sí. Se posiciona sobre el elemento activo y viaja hasta el
 * siguiente. Si no hay ninguno activo, se apaga en el sitio en vez de saltar a
 * la esquina.
 */
export function Indicador({
  caja,
  animable,
  className,
  children,
}: {
  caja: Caja | null
  animable: boolean
  className?: string
  children?: React.ReactNode
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute',
        animable && 'transition-[left,width,opacity] duration-base ease-salida',
        className,
      )}
      style={{
        left: caja?.left ?? 0,
        width: caja?.width ?? 0,
        opacity: caja ? 1 : 0,
      }}
    >
      {children}
    </span>
  )
}
