'use client'

import { useRouter } from 'next/navigation'
import type { LocationRow } from '@/lib/database.types'
import { Select } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Selector de local para encargado y operador, que trabajan sobre los tres.
 * El barista nunca lo ve: su local viene del perfil y no es una decisión suya.
 */
export function SelectorLocal({
  locales,
  actual,
  basePath,
}: {
  locales: LocationRow[]
  actual: string
  basePath: string
}) {
  const router = useRouter()

  if (locales.length <= 1) return null

  return (
    <div className="flex items-center gap-3">
      <Label htmlFor="selector-local" className="shrink-0 text-muted-foreground">
        Local
      </Label>
      <Select
        id="selector-local"
        value={actual}
        onChange={(e) => router.push(`${basePath}?local=${e.target.value}`)}
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
