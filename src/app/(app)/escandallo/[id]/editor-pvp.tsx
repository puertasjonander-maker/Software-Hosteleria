'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { euros, fecha } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fijarPvp } from '../acciones'

/**
 * PVP de la elaboración. Se teclea a mano y a propósito: Mise no lee ventas de
 * Square, así que el precio de carta lo pone quien lo decide. La fecha en que se
 * fijó es lo que después permite decir "el coste ha subido un 12 % desde que
 * pusiste este precio".
 */
export function EditorPvp({
  recipeId,
  pvpActual,
  fijadoEn,
}: {
  recipeId: string
  pvpActual: number | null
  fijadoEn: string | null
}) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(pvpActual === null ? '' : String(pvpActual))
  const [guardando, iniciar] = useTransition()

  if (!editando) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-2xl font-semibold tabular-nums">{euros(pvpActual)}</p>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Cambiar el PVP"
            onClick={() => setEditando(true)}
          >
            <Pencil />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {fijadoEn ? `Fijado el ${fecha(fijadoEn)}` : 'Sin PVP fijado'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        autoFocus
        inputMode="decimal"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        aria-label="PVP con IVA"
        className="w-24"
      />
      <Button
        size="icon"
        aria-label="Guardar PVP"
        disabled={guardando}
        onClick={() =>
          iniciar(async () => {
            const numero = valor.trim() === '' ? null : Number(valor.replace(',', '.'))
            if (numero !== null && (!Number.isFinite(numero) || numero < 0)) {
              toast.error('El PVP no es un número válido')
              return
            }

            const resultado = await fijarPvp(recipeId, numero)
            if (resultado.ok) {
              setEditando(false)
              toast.success('PVP actualizado')
            } else {
              toast.error(resultado.mensaje)
            }
          })
        }
      >
        {guardando ? <Loader2 className="animate-spin" /> : <Check />}
      </Button>
    </div>
  )
}
