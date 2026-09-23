'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Indicador, useIndicador } from '@/components/ui/indicador'

export type Pestana = { href: string; etiqueta: string }

/**
 * Pestañas de sección (Administración, Escandallo).
 *
 * Antes ninguna de las dos marcaba cuál estaba abierta: siete enlaces del mismo
 * color, y la única pista de dónde estabas era el contenido. Ahora la activa
 * lleva el subrayado, y el subrayado viaja hasta la siguiente.
 *
 * La activa es la ruta más larga que casa, para que `/admin/productos` no
 * encienda también `/admin`.
 *
 * En el móvil van en una sola fila que se desplaza de lado. Con `flex-wrap`, las
 * siete de administración partían en tres renglones y el subrayado de la
 * activa quedaba pegado al borde de un renglón que no era el suyo.
 */
export function PestanasSeccion({ pestanas }: { pestanas: Pestana[] }) {
  const pathname = usePathname()

  const activa =
    [...pestanas]
      .sort((a, b) => b.href.length - a.href.length)
      .find((p) => pathname === p.href || pathname.startsWith(`${p.href}/`)) ?? null

  const { contenedor, caja, animable } = useIndicador<HTMLElement>(activa?.href ?? null)

  // La activa se trae a la vista: entrar en «Ajustes» desde un enlace no puede
  // dejarla escondida detrás del borde derecho.
  useEffect(() => {
    if (!activa) return
    const nodo = contenedor.current?.querySelector<HTMLElement>(
      `[data-indicador="${CSS.escape(activa.href)}"]`,
    )
    nodo?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activa, contenedor])

  return (
    <nav
      ref={contenedor}
      className="relative -mx-4 flex gap-1 overflow-x-auto border-b px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
    >
      <Indicador caja={caja} animable={animable} className="bottom-0 flex justify-center">
        <span className="h-0.5 w-full rounded-full bg-primary" />
      </Indicador>

      {pestanas.map((p) => (
        <Link
          key={p.href}
          href={p.href}
          data-indicador={p.href}
          aria-current={activa?.href === p.href ? 'page' : undefined}
          className={cn(
            'flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-t-md px-3 text-cuerpo font-medium',
            'outline-none transition-colors duration-rapido ease-estandar focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
            activa?.href === p.href
              ? 'text-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          {p.etiqueta}
        </Link>
      ))}
    </nav>
  )
}
