'use client'

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
 */
export function PestanasSeccion({ pestanas }: { pestanas: Pestana[] }) {
  const pathname = usePathname()

  const activa =
    [...pestanas]
      .sort((a, b) => b.href.length - a.href.length)
      .find((p) => pathname === p.href || pathname.startsWith(`${p.href}/`)) ?? null

  const { contenedor, caja, animable } = useIndicador<HTMLElement>(activa?.href ?? null)

  return (
    <nav ref={contenedor} className="relative flex flex-wrap gap-1 border-b">
      <Indicador caja={caja} animable={animable} className="bottom-[-1px] flex justify-center">
        <span className="h-0.5 w-full rounded-full bg-primary" />
      </Indicador>

      {pestanas.map((p) => (
        <Link
          key={p.href}
          href={p.href}
          data-indicador={p.href}
          aria-current={activa?.href === p.href ? 'page' : undefined}
          className={cn(
            'rounded-t-md px-3 py-2 text-cuerpo font-medium',
            'transition-colors duration-rapido ease-estandar',
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
