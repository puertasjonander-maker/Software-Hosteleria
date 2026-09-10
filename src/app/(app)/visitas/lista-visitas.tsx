'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarPlus, ChevronRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { EstadoServicio, Semaforo, TipoMaquina } from '@/lib/database.types'
import { ETIQUETA_ESTADO_SERVICIO, ETIQUETA_TIPO_MAQUINA, ORDEN_SEMAFORO } from '@/lib/roles'
import { fecha as formatearFecha, plural } from '@/lib/format'
import { hoyEnMadrid } from '@/lib/time'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EstadoVacio } from '@/components/ui/states'
import { PuntoSemaforo } from '@/components/chip-semaforo'
import { crearVisita } from './acciones'

export type VisitaFila = {
  id: string
  clienteId: string
  clienteNombre: string
  fecha: string
  estado: EstadoServicio
  maquinas: number
  hechas: number
}

export type MaquinaParaPlanificar = {
  id: string
  nombre: string
  tipo: TipoMaquina
  estado: Semaforo
  diasHastaRevision: number | null
}

export type BoxParaPlanificar = {
  id: string
  nombre: string
  poblacion: string | null
  maquinas: MaquinaParaPlanificar[]
}

export function ListaVisitas({
  visitas,
  boxes,
}: {
  visitas: VisitaFila[]
  boxes: BoxParaPlanificar[]
}) {
  const [planificando, setPlanificando] = useState(false)

  // Lo abierto arriba y lo terminado abajo. Una visita cerrada es histórico; lo
  // que se busca al abrir esta pantalla es el trabajo que queda.
  const abiertas = visitas.filter((v) => v.estado !== 'hecho')
  const cerradas = visitas.filter((v) => v.estado === 'hecho')

  return (
    <div className="space-y-4">
      <Button onClick={() => setPlanificando(true)} disabled={boxes.length === 0}>
        <CalendarPlus /> Planificar visita
      </Button>

      {visitas.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay ninguna visita"
          descripcion={
            boxes.length === 0
              ? 'Antes hace falta un box con parque. Se dan de alta en Boxes.'
              : 'Planifica la primera: eliges box, fecha y qué máquinas entran.'
          }
        />
      ) : (
        <div className="space-y-4">
          {abiertas.length > 0 ? <Grupo titulo="Por hacer" visitas={abiertas} /> : null}
          {cerradas.length > 0 ? <Grupo titulo="Terminadas" visitas={cerradas} /> : null}
        </div>
      )}

      <Planificador
        abierto={planificando}
        onCerrar={() => setPlanificando(false)}
        boxes={boxes}
      />
    </div>
  )
}

function Grupo({ titulo, visitas }: { titulo: string; visitas: VisitaFila[] }) {
  return (
    <section className="space-y-2">
      <h2 className="titulo-seccion">{titulo}</h2>
      <ul className="space-y-2">
        {visitas.map((v) => (
          <li key={v.id}>
            <Link
              href={`/visitas/${v.id}`}
              className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors duration-rapido ease-estandar hover:bg-accent"
            >
              <div className="min-w-0 flex-1">
                <span className="truncate titulo-tarjeta">{v.clienteNombre}</span>
                <p className="mt-0.5 texto-meta">
                  {formatearFecha(v.fecha)} · {ETIQUETA_ESTADO_SERVICIO[v.estado]}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="cifra-dato leading-none">
                  {v.hechas}
                  <span className="text-meta font-normal text-muted-foreground">/{v.maquinas}</span>
                </p>
                <p className="texto-micro text-muted-foreground">máquinas</p>
              </div>

              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Planificador (EBX-201).
 *
 * Vienen marcadas de serie las máquinas que lo piden: revisión vencida o dentro
 * de dos semanas, y todo lo que no esté en verde. Es la lista que se llevaría
 * apuntada de todas formas, así que el caso normal es abrir, mirar y aceptar.
 */
function Planificador({
  abierto,
  onCerrar,
  boxes,
}: {
  abierto: boolean
  onCerrar: () => void
  boxes: BoxParaPlanificar[]
}) {
  const router = useRouter()
  const [boxId, setBoxId] = useState(boxes[0]?.id ?? '')
  const [fecha, setFecha] = useState(hoyEnMadrid())
  const [quitadas, setQuitadas] = useState<Set<string>>(new Set())
  const [creando, iniciar] = useTransition()

  const box = boxes.find((b) => b.id === boxId) ?? boxes[0]

  const maquinas = useMemo(() => {
    const lista = [...(box?.maquinas ?? [])]
    lista.sort((a, b) => {
      const porEstado = ORDEN_SEMAFORO[a.estado] - ORDEN_SEMAFORO[b.estado]
      if (porEstado !== 0) return porEstado
      const diasA = a.diasHastaRevision ?? Number.POSITIVE_INFINITY
      const diasB = b.diasHastaRevision ?? Number.POSITIVE_INFINITY
      if (diasA !== diasB) return diasA - diasB
      return a.nombre.localeCompare(b.nombre, 'es')
    })
    return lista
  }, [box])

  function vienePorDefecto(m: MaquinaParaPlanificar): boolean {
    if (m.estado !== 'verde') return true
    return m.diasHastaRevision !== null && m.diasHastaRevision <= 14
  }

  const elegidas = maquinas.filter((m) => vienePorDefecto(m) !== quitadas.has(m.id))

  function alternar(id: string) {
    setQuitadas((previo) => {
      const siguiente = new Set(previo)
      if (siguiente.has(id)) siguiente.delete(id)
      else siguiente.add(id)
      return siguiente
    })
  }

  function crear() {
    if (!box) return
    iniciar(async () => {
      const r = await crearVisita(
        box.id,
        fecha,
        elegidas.map((m) => m.id),
      )
      if (r.ok && r.id) {
        toast.success('Visita planificada')
        onCerrar()
        router.push(`/visitas/${r.id}`)
      } else if (!r.ok) {
        toast.error(r.mensaje)
      }
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => (v ? null : onCerrar())}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Planificar visita</DialogTitle>
          <DialogDescription>
            Vienen marcadas las que lo piden: vencidas, próximas o fuera de verde.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="visita-box">Box</Label>
              <Select
                id="visita-box"
                value={boxId}
                onChange={(e) => {
                  setBoxId(e.target.value)
                  setQuitadas(new Set())
                }}
              >
                {boxes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre}
                    {b.poblacion ? ` · ${b.poblacion}` : ''}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="visita-fecha">Fecha</Label>
              <Input
                id="visita-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
          </div>

          {maquinas.length === 0 ? (
            <p className="texto-meta">
              Este box no tiene parque todavía. Impórtalo antes de planificar la visita.
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label>Máquinas</Label>
              <ul className="divide-y rounded-lg border">
                {maquinas.map((m) => {
                  const marcada = vienePorDefecto(m) !== quitadas.has(m.id)
                  return (
                    <li key={m.id}>
                      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={marcada}
                          onChange={() => alternar(m.id)}
                          className="h-5 w-5 shrink-0 rounded border-input"
                        />
                        <PuntoSemaforo estado={m.estado} />
                        <span className="min-w-0 flex-1 truncate text-cuerpo">{m.nombre}</span>
                        <span className="shrink-0 texto-micro text-muted-foreground">
                          {ETIQUETA_TIPO_MAQUINA[m.tipo]}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={crear} disabled={elegidas.length === 0 || creando}>
            {creando ? <Loader2 className="animate-spin" /> : null}
            Planificar con {plural(elegidas.length, 'máquina', 'máquinas')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
