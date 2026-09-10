'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, NotebookPen, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import type { Semaforo, TipoEvento } from '@/lib/database.types'
import type { MaquinaFila } from '@/lib/parque'
import { ETIQUETA_SEMAFORO, ETIQUETA_TIPO_EVENTO, TIPOS_ANOTABLES } from '@/lib/roles'
import { hoyEnMadrid } from '@/lib/time'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { anotarEvento, type DatosEvento } from '../../../acciones'
import { FormularioMaquina } from '../../formulario-maquina'

const ESTADOS = Object.keys(ETIQUETA_SEMAFORO) as Semaforo[]

/** Los dos botones de la ficha interna: editar los datos y anotar en el histórico. */
export function ControlesMaquina({
  clienteId,
  maquina,
}: {
  clienteId: string
  maquina: MaquinaFila
}) {
  const [editando, setEditando] = useState(false)
  const [anotando, setAnotando] = useState(false)

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" className="sm:h-9 sm:px-3" onClick={() => setEditando(true)}>
        <Pencil /> Editar ficha
      </Button>
      <Button variant="outline" className="sm:h-9 sm:px-3" onClick={() => setAnotando(true)}>
        <NotebookPen /> Anotar
      </Button>

      <FormularioMaquina
        abierto={editando}
        onCerrar={() => setEditando(false)}
        clienteId={clienteId}
        maquina={maquina}
      />

      <DialogoAnotar
        abierto={anotando}
        onCerrar={() => setAnotando(false)}
        clienteId={clienteId}
        maquinaId={maquina.id}
      />
    </div>
  )
}

/**
 * Anotación manual (EBX-302).
 *
 * La fecha se puede mover hacia atrás a propósito: lo que se anota casi siempre
 * pasó antes de que alguien se acordara de escribirlo. "Llegó con óxido de
 * fábrica" es de hace tres meses.
 */
function DialogoAnotar({
  abierto,
  onCerrar,
  clienteId,
  maquinaId,
}: {
  abierto: boolean
  onCerrar: () => void
  clienteId: string
  maquinaId: string
}) {
  const router = useRouter()
  const [guardando, iniciar] = useTransition()

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const datos = new FormData(e.currentTarget)

    const estado = String(datos.get('estado_resultante') ?? '')
    const payload: DatosEvento = {
      fecha: String(datos.get('fecha') ?? hoyEnMadrid()),
      tipo: String(datos.get('tipo') ?? 'incidencia') as TipoEvento,
      texto: String(datos.get('texto') ?? ''),
      estadoResultante: estado === '' ? null : (estado as Semaforo),
    }

    if (payload.texto.trim() === '') return

    iniciar(async () => {
      const r = await anotarEvento(clienteId, maquinaId, payload)
      if (r.ok) {
        toast.success('Anotado en el histórico')
        onCerrar()
        router.refresh()
      } else {
        toast.error(r.mensaje)
      }
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => (v ? null : onCerrar())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Anotar en el histórico</DialogTitle>
          <DialogDescription>
            Para lo que no viene de una visita. Lo verá el dueño del box en la ficha de la máquina.
          </DialogDescription>
        </DialogHeader>

        {/* `key` para vaciar el formulario entre aperturas: una anotación repetida
            por error es peor que teclearla dos veces. */}
        <form key={abierto ? 'abierto' : 'cerrado'} onSubmit={enviar} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tipo">Tipo</Label>
              <Select id="tipo" name="tipo" defaultValue="incidencia">
                {TIPOS_ANOTABLES.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_TIPO_EVENTO[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fecha">Cuándo</Label>
              <Input id="fecha" name="fecha" type="date" defaultValue={hoyEnMadrid()} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="texto">Qué pasó</Label>
            <Textarea
              id="texto"
              name="texto"
              rows={3}
              required
              placeholder="Llegó con óxido de fábrica en el raíl"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="estado_resultante">Estado que deja (opcional)</Label>
            <Select id="estado_resultante" name="estado_resultante" defaultValue="">
              <option value="">No lo dice</option>
              {ESTADOS.map((s) => (
                <option key={s} value={s}>
                  {ETIQUETA_SEMAFORO[s]}
                </option>
              ))}
            </Select>
            <p className="texto-micro text-muted-foreground">
              Es lo que se lee en la línea del histórico. El semáforo de la máquina se cambia en la
              ficha.
            </p>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={guardando}>
              {guardando ? <Loader2 className="animate-spin" /> : null}
              Anotar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
