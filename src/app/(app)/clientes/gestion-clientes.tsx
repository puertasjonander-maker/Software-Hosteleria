'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { Semaforo } from '@/lib/database.types'
import { plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EstadoVacio } from '@/components/ui/states'
import { PuntoSemaforo } from '@/components/chip-semaforo'
import { guardarCliente } from './acciones'

export type BoxResumen = {
  id: string
  nombre: string
  poblacion: string | null
  contactoNombre: string | null
  activo: boolean
  maquinas: number
  peor: Semaforo | null
  vencidas: number
}

export function GestionClientes({
  boxes,
  puedeCrear,
}: {
  boxes: BoxResumen[]
  puedeCrear: boolean
}) {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [poblacion, setPoblacion] = useState('')
  const [guardando, iniciar] = useTransition()

  function crear() {
    if (!nombre.trim()) return
    iniciar(async () => {
      const r = await guardarCliente(null, {
        nombre: nombre.trim(),
        direccion: null,
        poblacion: poblacion.trim() || null,
        contactoNombre: null,
        contactoTelefono: null,
        contactoEmail: null,
        notas: null,
        activo: true,
      })
      if (r.ok) {
        setNombre('')
        setPoblacion('')
        toast.success('Box creado')
        router.refresh()
      } else {
        toast.error(r.mensaje)
      }
    })
  }

  return (
    <div className="space-y-4">
      {puedeCrear ? (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-6">
            <div className="min-w-[14rem] flex-1 space-y-1.5">
              <Label htmlFor="nuevo-box">Nombre del box</Label>
              <Input
                id="nuevo-box"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') crear()
                }}
                placeholder="CrossFit IronBuster"
              />
            </div>
            <div className="min-w-[10rem] flex-1 space-y-1.5">
              <Label htmlFor="nueva-poblacion">Población</Label>
              <Input
                id="nueva-poblacion"
                value={poblacion}
                onChange={(e) => setPoblacion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') crear()
                }}
                placeholder="Pizarra"
              />
            </div>
            <Button onClick={crear} disabled={!nombre.trim() || guardando}>
              {guardando ? <Loader2 className="animate-spin" /> : <Plus />}
              Añadir box
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {boxes.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay ningún box"
          descripcion={
            puedeCrear
              ? 'Crea el primero y después importa su parque desde la hoja de la visita.'
              : 'Pídele a administración que dé de alta el primero.'
          }
        />
      ) : (
        /*
         * Lista de tarjetas y no tabla. Esta pantalla se abre de camino al box,
         * en el móvil, y lo único que se busca es "cuál era y qué tenía": una
         * tabla de cinco columnas aquí obliga a desplazarse en horizontal para
         * leer lo que cabe en dos líneas.
         */
        <ul className="space-y-2">
          {boxes.map((b) => (
            <li key={b.id}>
              <Link
                href={`/clientes/${b.id}`}
                className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors duration-rapido ease-estandar hover:bg-accent"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {b.peor ? <PuntoSemaforo estado={b.peor} /> : null}
                    <span className="truncate titulo-tarjeta">{b.nombre}</span>
                    {!b.activo ? (
                      <span className="shrink-0 texto-micro text-muted-foreground">inactivo</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate texto-meta">
                    {[
                      b.poblacion,
                      b.maquinas > 0
                        ? `${b.maquinas} ${plural(b.maquinas, 'máquina', 'máquinas')}`
                        : 'sin parque',
                      b.contactoNombre,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>

                {b.vencidas > 0 ? (
                  <span className="shrink-0 rounded-full bg-destructive/10 px-2.5 py-0.5 text-micro font-semibold text-destructive">
                    {b.vencidas} {plural(b.vencidas, 'vencida', 'vencidas')}
                  </span>
                ) : null}

                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
