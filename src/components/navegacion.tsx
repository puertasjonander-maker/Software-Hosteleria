'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  Building2,
  ChevronLeft,
  Dumbbell,
  LogOut,
  Settings,
  Wrench,
} from 'lucide-react'
import type { RolUsuario } from '@/lib/database.types'
import { ETIQUETA_ROL } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { Indicador, useIndicador } from '@/components/ui/indicador'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { ID_RANURA_CABECERA } from '@/components/ranura-cabecera'

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
  { href: '/visitas', etiqueta: 'Visitas', icono: Wrench, roles: ['admin', 'tecnico'] },
  { href: '/clientes', etiqueta: 'Boxes', icono: Building2, roles: ['admin', 'tecnico'] },
  { href: '/panel', etiqueta: 'Panel', icono: BarChart3, roles: ['admin'] },
  { href: '/admin', etiqueta: 'Admin', icono: Settings, roles: ['admin'] },
  // El cliente ve una sola pestaña. No es una limitación: es todo lo que hay
  // para él, y una barra con un único destino se lee como "estás en tu sitio".
  { href: '/mi-box', etiqueta: 'Mi box', icono: Dumbbell, roles: ['cliente'] },
]

/**
 * En el móvil, la cabecera dice en qué pantalla estás. La barra de abajo ya
 * dice a cuál puedes ir, así que repetir el título dentro del contenido cuesta
 * 60 px de lista por nada. En escritorio manda la marca y el `h1` se queda
 * donde estaba.
 *
 * De lo más específico a lo más general: la primera que casa, gana.
 */
const TITULOS: Array<[RegExp, string]> = [
  [/^\/visitas\/[^/]+\/maquina\/[^/]+/, 'Máquina'],
  [/^\/visitas\/[^/]+/, 'Visita'],
  [/^\/visitas/, 'Visitas'],
  [/^\/clientes\/[^/]+\/maquinas\/[^/]+/, 'Ficha de máquina'],
  [/^\/clientes\/[^/]+/, 'Box'],
  [/^\/clientes/, 'Boxes'],
  [/^\/mi-box\/maquinas\/[^/]+/, 'Ficha de máquina'],
  [/^\/mi-box/, 'Mi box'],
  [/^\/panel/, 'Panel'],
  [/^\/admin/, 'Administración'],
  [/^\/sin-permiso/, 'Sin permiso'],
]

function tituloDe(pathname: string): string {
  return TITULOS.find(([patron]) => patron.test(pathname))?.[1] ?? 'Ergobox'
}

/** Tramos que solo agrupan y no tienen pantalla: se saltan al volver atrás. */
const TRAMOS_SIN_PANTALLA = new Set(['maquinas', 'maquina'])

function padreDe(pathname: string): string {
  const segmentos = pathname.split('/').slice(0, -1)
  if (TRAMOS_SIN_PANTALLA.has(segmentos[segmentos.length - 1] ?? '')) segmentos.pop()
  return segmentos.join('/') || '/'
}

/** Iniciales para el avatar. Dos como mucho: a 30 px no cabe más. */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '·'
  return partes
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function Navegacion({
  rol,
  nombre,
  box,
}: {
  rol: RolUsuario
  nombre: string
  /** Nombre del box, solo para un cliente. Un interno no está atado a ninguno. */
  box: string | null
}) {
  const pathname = usePathname()
  const visibles = DESTINOS.filter((d) => d.roles.includes(rol))

  const esActivo = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  const activo = visibles.find((d) => esActivo(d.href)) ?? null

  // Una raíz no lleva atrás; una pantalla de dentro, sí. El padre es el segmento
  // de arriba, salvo cuando ese segmento es un tramo de colección que no tiene
  // pantalla propia: /clientes/abc/maquinas/xyz vuelve a /clientes/abc, no a
  // /clientes/abc/maquinas, que daría un 404.
  const esRaiz = visibles.some((d) => d.href === pathname)
  const volverA = esRaiz ? null : padreDe(pathname)

  /*
   * La cabecera va plana mientras no haya nada por encima. El borde y la sombra
   * aparecen solo cuando hay contenido debajo de ella: antes el borde estaba
   * puesto siempre, incluso con la página sin desplazar.
   */
  const [elevada, setElevada] = useState(false)
  useEffect(() => {
    const alDesplazar = () => setElevada(window.scrollY > 8)
    alDesplazar()
    window.addEventListener('scroll', alDesplazar, { passive: true })
    return () => window.removeEventListener('scroll', alDesplazar)
  }, [])

  const escritorio = useIndicador<HTMLElement>(activo?.href ?? null)
  const movil = useIndicador<HTMLUListElement>(activo?.href ?? null)

  return (
    <>
      <header
        className={cn(
          'safe-top sticky top-0 z-30 border-b bg-background/95 backdrop-blur',
          'transition-[border-color,box-shadow] duration-base ease-estandar',
          elevada ? 'border-border shadow-[0_4px_12px_-6px_hsl(var(--foreground)/0.28)]' : 'border-transparent',
        )}
      >
        <div className="container flex h-14 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
            {/* Móvil: volver + título de pantalla. */}
            {volverA ? (
              <Link
                href={volverA}
                aria-label="Volver"
                className="-ml-2 flex h-11 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-rapido ease-estandar hover:bg-accent hover:text-accent-foreground md:hidden"
              >
                <ChevronLeft className="h-5 w-5" />
              </Link>
            ) : null}

            <Link
              href="/"
              className={cn(
                'shrink-0 items-center gap-2 font-semibold',
                // Con botón de volver, la marca estorba: ya hay una jerarquía.
                volverA ? 'hidden md:flex' : 'flex',
              )}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-sm text-primary-foreground">
                E
              </span>
              <span className="hidden lg:inline">Ergobox</span>
            </Link>

            <h2 className="truncate text-tarjeta font-semibold md:hidden">{tituloDe(pathname)}</h2>

            <nav ref={escritorio.contenedor} className="relative hidden items-center gap-1 md:flex">
              <Indicador
                caja={escritorio.caja}
                animable={escritorio.animable}
                className="inset-y-0 rounded-md bg-secondary"
              />
              {visibles.map((d) => (
                <Link
                  key={d.href}
                  href={d.href}
                  data-indicador={d.href}
                  className={cn(
                    'relative rounded-md px-3 py-2 text-cuerpo font-medium',
                    'transition-colors duration-rapido ease-estandar',
                    esActivo(d.href)
                      ? 'text-secondary-foreground'
                      : 'text-muted-foreground hover:text-accent-foreground',
                  )}
                >
                  {d.etiqueta}
                </Link>
              ))}
            </nav>
          </div>

          {/* Hueco para los controles propios de cada pantalla. */}
          <div id={ID_RANURA_CABECERA} className="flex min-w-0 shrink items-center justify-end" />

          <Menu>
            <MenuTrigger
              aria-label={`Cuenta de ${nombre}`}
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground outline-none transition-colors duration-rapido ease-estandar hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {iniciales(nombre)}
            </MenuTrigger>

            <MenuContent align="end">
              <MenuLabel>
                <p className="truncate text-cuerpo font-medium leading-tight">{nombre}</p>
                <p className="truncate text-meta leading-tight text-muted-foreground">
                  {ETIQUETA_ROL[rol]}
                  {box ? ` · ${box}` : ''}
                </p>
              </MenuLabel>

              <MenuSeparator />

              {/* El formulario envuelve al item: el `asChild` deja que el botón
                  sea el item, así que un toque cierra el menú y envía a la vez. */}
              <form action="/auth/signout" method="post">
                <MenuItem asChild>
                  <button type="submit" className="w-full">
                    <LogOut /> Salir
                  </button>
                </MenuItem>
              </form>
            </MenuContent>
          </Menu>
        </div>
      </header>

      {/* Barra inferior: en el móvil el pulgar llega abajo, no arriba. */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur md:hidden">
        <ul ref={movil.contenedor} className="relative flex items-stretch justify-around">
          <Indicador caja={movil.caja} animable={movil.animable} className="top-0 flex justify-center">
            <span className="h-[2.5px] w-10 rounded-full bg-primary" />
          </Indicador>

          {visibles.map((d) => {
            const Icono = d.icono
            const esta = esActivo(d.href)
            return (
              <li key={d.href} className="flex-1">
                <Link
                  href={d.href}
                  data-indicador={d.href}
                  aria-current={esta ? 'page' : undefined}
                  className={cn(
                    'flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-micro',
                    'transition-colors duration-rapido ease-estandar',
                    esta ? 'font-semibold text-primary' : 'font-medium text-muted-foreground',
                  )}
                >
                  <Icono
                    className={cn(
                      'h-5 w-5 transition-transform duration-base ease-salida',
                      esta && 'scale-[1.08]',
                    )}
                  />
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
