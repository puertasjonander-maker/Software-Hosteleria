'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  ClipboardList,
  LogOut,
  PlusCircle,
  Settings,
  UtensilsCrossed,
} from 'lucide-react'
import type { RolUsuario } from '@/lib/database.types'
import { ETIQUETA_ROL } from '@/lib/roles'
import { cn } from '@/lib/utils'

type Destino = {
  href: string
  etiqueta: string
  icono: React.ComponentType<{ className?: string }>
  roles: RolUsuario[]
}

/**
 * Un mismo mapa de destinos alimenta la barra inferior del móvil y la superior
 * de escritorio. Cada rol ve solo lo suyo: enseñar una pestaña que lleva a
 * "sin permiso" es hacer perder un toque a alguien con prisa.
 */
const DESTINOS: Destino[] = [
  {
    href: '/pedir',
    etiqueta: 'Pedir',
    icono: PlusCircle,
    roles: ['barista', 'encargado', 'operador'],
  },
  {
    href: '/pedidos',
    etiqueta: 'Pedidos',
    icono: ClipboardList,
    roles: ['barista', 'encargado', 'operador'],
  },
  {
    href: '/escandallo',
    etiqueta: 'Escandallo',
    icono: UtensilsCrossed,
    roles: ['encargado', 'operador'],
  },
  { href: '/panel', etiqueta: 'Panel', icono: BarChart3, roles: ['operador'] },
  { href: '/admin', etiqueta: 'Admin', icono: Settings, roles: ['operador'] },
]

export function Navegacion({
  rol,
  nombre,
  local,
}: {
  rol: RolUsuario
  nombre: string
  local: string | null
}) {
  const pathname = usePathname()
  const visibles = DESTINOS.filter((d) => d.roles.includes(rol))

  const esActivo = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <>
      <header className="safe-top sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-14 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-sm text-primary-foreground">
                M
              </span>
              <span className="hidden sm:inline">Mise</span>
            </Link>

            <nav className="hidden items-center gap-1 md:flex">
              {visibles.map((d) => (
                <Link
                  key={d.href}
                  href={d.href}
                  className={cn(
                    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    esActivo(d.href)
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {d.etiqueta}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0 text-right">
              <p className="truncate text-sm font-medium leading-tight">{nombre}</p>
              <p className="truncate text-xs text-muted-foreground leading-tight">
                {ETIQUETA_ROL[rol]}
                {local ? ` · ${local}` : ''}
              </p>
            </div>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                aria-label="Salir"
                title="Salir"
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Barra inferior: en el móvil el pulgar llega abajo, no arriba. */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur md:hidden">
        <ul className="flex items-stretch justify-around">
          {visibles.map((d) => {
            const Icono = d.icono
            const activo = esActivo(d.href)
            return (
              <li key={d.href} className="flex-1">
                <Link
                  href={d.href}
                  aria-current={activo ? 'page' : undefined}
                  className={cn(
                    'flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors',
                    activo ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  <Icono className="h-5 w-5" />
                  {d.etiqueta}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}
