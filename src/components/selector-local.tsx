'use client'

import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import type { LocationRow } from '@/lib/database.types'
import { Select } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * Selector de local para encargado y operador, que trabajan sobre los tres.
 * El barista nunca lo ve: su local viene del perfil y no es una decisión suya.
 *
 * Dos formas:
 *  · `fila` — con etiqueta, dentro del contenido. Es la de siempre.
 *  · `chip` — compacta, para la cabecera. En una pantalla de 844 px, la fila
 *    con etiqueta costaba 60 px por encima del primer producto para decir una
 *    palabra que cambia una vez al día.
 */
export function SelectorLocal({
  locales,
  actual,
  basePath,
  forma = 'fila',
  className,
}: {
  locales: LocationRow[]
  actual: string
  basePath: string
  forma?: 'fila' | 'chip'
  className?: string
}) {
  const router = useRouter()

  if (locales.length <= 1) return null

  const ir = (id: string) => router.push(`${basePath}?local=${id}`)

  if (forma === 'chip') {
    const nombre = locales.find((l) => l.id === actual)?.name ?? 'Local'

    return (
      <div className={cn('relative min-w-0', className)}>
        {/* El `select` nativo va encima y transparente: conserva la rueda del
            sistema, que en móvil es mejor que cualquier lista que dibujemos. */}
        <select
          aria-label="Local"
          value={actual}
          onChange={(e) => ir(e.target.value)}
          className="absolute inset-0 z-10 w-full cursor-pointer opacity-0"
        >
          {locales.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>

        <span
          aria-hidden
          className="flex h-[30px] min-w-0 items-center gap-1.5 rounded-full border bg-card px-3 text-meta font-medium transition-colors duration-rapido ease-estandar"
        >
          <span className="truncate">{nombre}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </span>
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Label htmlFor="selector-local" className="shrink-0 text-muted-foreground">
        Local
      </Label>
      <Select
        id="selector-local"
        value={actual}
        onChange={(e) => ir(e.target.value)}
        className="max-w-xs"
      >
        {locales.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </Select>
    </div>
  )
}
