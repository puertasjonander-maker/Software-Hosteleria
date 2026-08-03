'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Rango } from '@/lib/rango-fechas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { hoyEnMadrid } from '@/lib/time'

const ATAJOS = [
  { dias: 30, etiqueta: '30 días' },
  { dias: 90, etiqueta: '90 días' },
  { dias: 365, etiqueta: '1 año' },
]

/**
 * Filtro de rango. Los atajos van primero porque son el 90 % de los usos; los
 * campos de fecha están para el 10 % restante, no al revés.
 */
export function FiltroRango({ rango }: { rango: Rango }) {
  const router = useRouter()
  const [desde, setDesde] = useState(rango.desde)
  const [hasta, setHasta] = useState(rango.hasta)

  function aplicar(d: string, h: string) {
    router.push(`/panel?desde=${d}&hasta=${h}`)
  }

  function atajo(dias: number) {
    const fin = hoyEnMadrid()
    const inicio = new Date(`${fin}T12:00:00Z`)
    inicio.setUTCDate(inicio.getUTCDate() - dias)
    const d = inicio.toISOString().slice(0, 10)
    setDesde(d)
    setHasta(fin)
    aplicar(d, fin)
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex gap-1">
        {ATAJOS.map((a) => (
          <Button key={a.dias} size="sm" variant="ghost" onClick={() => atajo(a.dias)}>
            {a.etiqueta}
          </Button>
        ))}
      </div>

      <div className="space-y-1">
        <Label htmlFor="desde" className="text-xs text-muted-foreground">
          Desde
        </Label>
        <Input
          id="desde"
          type="date"
          value={desde}
          max={hasta}
          onChange={(e) => setDesde(e.target.value)}
          className="h-9 w-[9.5rem]"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="hasta" className="text-xs text-muted-foreground">
          Hasta
        </Label>
        <Input
          id="hasta"
          type="date"
          value={hasta}
          min={desde}
          onChange={(e) => setHasta(e.target.value)}
          className="h-9 w-[9.5rem]"
        />
      </div>

      <Button size="sm" variant="secondary" onClick={() => aplicar(desde, hasta)}>
        Aplicar
      </Button>
    </div>
  )
}
