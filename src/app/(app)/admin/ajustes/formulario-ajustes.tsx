'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { guardarAjuste } from '../acciones'

type Ajuste = {
  clave: string
  etiqueta: string
  sufijo: string
  ayuda: string
  min: number
  max: number
}

const AJUSTES: Ajuste[] = [
  {
    clave: 'price_deviation_threshold_pct',
    etiqueta: 'Aviso de desviación de precio',
    sufijo: '%',
    ayuda:
      'Cuando el precio de un albarán se separa más de esto del último conocido, la recepción lo marca. Es informativo: nunca impide guardar (MISE-006).',
    min: 0,
    max: 100,
  },
  {
    clave: 'cost_increase_alert_pct',
    etiqueta: 'Aviso de subida de coste',
    sufijo: '%',
    ayuda:
      'Cuánto tiene que subir el coste de una elaboración desde que se fijó su PVP para que aparezca destacada.',
    min: 0,
    max: 100,
  },
  {
    clave: 'reminder_hours_encargado',
    etiqueta: 'Aviso al encargado antes del corte',
    sufijo: 'h',
    ayuda: 'Con cuánta antelación se avisa a quien tiene que mandar el pedido.',
    min: 0,
    max: 24,
  },
  {
    clave: 'reminder_hours_barista',
    etiqueta: 'Aviso a los baristas antes del corte',
    sufijo: 'h',
    ayuda:
      'Antes que al encargado, para que dé tiempo a registrar lo que falta antes de que se cierre el pedido.',
    min: 0,
    max: 24,
  },
]

export function FormularioAjustes({ valores }: { valores: Record<string, number> }) {
  const router = useRouter()
  const [estado, setEstado] = useState<Record<string, string>>(() =>
    Object.fromEntries(AJUSTES.map((a) => [a.clave, String(valores[a.clave] ?? '')])),
  )
  const [guardando, iniciar] = useTransition()

  function guardarTodo() {
    iniciar(async () => {
      for (const ajuste of AJUSTES) {
        const numero = Number(estado[ajuste.clave].replace(',', '.'))
        if (!Number.isFinite(numero) || numero < ajuste.min || numero > ajuste.max) {
          toast.error(`"${ajuste.etiqueta}" tiene que estar entre ${ajuste.min} y ${ajuste.max}`)
          return
        }
      }

      for (const ajuste of AJUSTES) {
        const numero = Number(estado[ajuste.clave].replace(',', '.'))
        const resultado = await guardarAjuste(ajuste.clave, numero)
        if (!resultado.ok) {
          toast.error(resultado.mensaje)
          return
        }
      }

      toast.success('Ajustes guardados')
      router.refresh()
    })
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-base">Umbrales y avisos</CardTitle>
        <p className="text-sm text-muted-foreground">
          Valores que cambian cuándo la app llama la atención sobre algo. Ninguno bloquea una
          operación.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {AJUSTES.map((ajuste) => (
          <div key={ajuste.clave} className="space-y-1.5">
            <Label htmlFor={ajuste.clave}>{ajuste.etiqueta}</Label>
            <div className="flex items-center gap-2">
              <Input
                id={ajuste.clave}
                inputMode="decimal"
                value={estado[ajuste.clave]}
                onChange={(e) =>
                  setEstado((previo) => ({ ...previo, [ajuste.clave]: e.target.value }))
                }
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">{ajuste.sufijo}</span>
            </div>
            <p className="text-xs text-muted-foreground">{ajuste.ayuda}</p>
          </div>
        ))}

        <Button onClick={guardarTodo} disabled={guardando}>
          {guardando ? <Loader2 className="animate-spin" /> : null}
          Guardar ajustes
        </Button>
      </CardContent>
    </Card>
  )
}
