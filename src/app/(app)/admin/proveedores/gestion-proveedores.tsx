'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { CanalContacto } from '@/lib/database.types'
import { ETIQUETA_CANAL } from '@/lib/roles'
import { DIAS_SEMANA } from '@/lib/time'
import { plural } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EstadoVacio } from '@/components/ui/states'
import { guardarPauta, guardarProveedor } from '../acciones'

type Pauta = {
  id?: string
  orderWeekday: number
  cutoffTime: string
  deliveryWeekday: number | null
  leadTimeDays: number
}

export type ProveedorVista = {
  id: string
  nombre: string
  canal: CanalContacto
  contacto: string
  notas: string | null
  activo: boolean
  productos: number
  pautas: Pauta[]
}

function DialogoProveedor({
  proveedor,
  abierto,
  onCerrar,
}: {
  proveedor: ProveedorVista | null
  abierto: boolean
  onCerrar: () => void
}) {
  const router = useRouter()
  const [nombre, setNombre] = useState(proveedor?.nombre ?? '')
  const [canal, setCanal] = useState<CanalContacto>(proveedor?.canal ?? 'whatsapp')
  const [contacto, setContacto] = useState(proveedor?.contacto ?? '')
  const [notas, setNotas] = useState(proveedor?.notas ?? '')
  const [activo, setActivo] = useState(proveedor?.activo ?? true)
  const [guardando, iniciar] = useTransition()

  function guardar() {
    if (!nombre.trim()) {
      toast.error('El proveedor necesita un nombre')
      return
    }

    iniciar(async () => {
      const resultado = await guardarProveedor(proveedor?.id ?? null, {
        nombre: nombre.trim(),
        canal,
        contacto: contacto.trim(),
        notas: notas.trim() || null,
        activo,
      })

      if (resultado.ok) {
        toast.success(proveedor ? 'Proveedor actualizado' : 'Proveedor creado')
        onCerrar()
        router.refresh()
      } else {
        toast.error(resultado.mensaje)
      }
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => (v ? null : onCerrar())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle>
          <DialogDescription>
            El canal y el contacto son los que usará el botón de envío del pedido.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pv-nombre">Nombre</Label>
            <Input id="pv-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pv-canal">Canal</Label>
            <Select
              id="pv-canal"
              value={canal}
              onChange={(e) => setCanal(e.target.value as CanalContacto)}
            >
              {(['whatsapp', 'email', 'telefono'] as const).map((c) => (
                <option key={c} value={c}>
                  {ETIQUETA_CANAL[c]}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pv-contacto">
              {canal === 'email' ? 'Correo' : 'Teléfono con prefijo'}
            </Label>
            <Input
              id="pv-contacto"
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
              placeholder={canal === 'email' ? 'pedidos@proveedor.com' : '+34600000000'}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pv-notas">Notas</Label>
            <Textarea
              id="pv-notas"
              rows={2}
              className="min-h-0"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Pedido mínimo, quién atiende, particularidades…"
            />
          </div>

          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              className="h-4 w-4"
            />
            Proveedor activo
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? <Loader2 className="animate-spin" /> : null}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogoPautas({
  proveedor,
  abierto,
  onCerrar,
}: {
  proveedor: ProveedorVista
  abierto: boolean
  onCerrar: () => void
}) {
  const router = useRouter()
  const [pautas, setPautas] = useState<Pauta[]>(proveedor.pautas)
  const [guardando, iniciar] = useTransition()

  function actualizar(indice: number, cambios: Partial<Pauta>) {
    setPautas((previo) => previo.map((p, i) => (i === indice ? { ...p, ...cambios } : p)))
  }

  function guardar() {
    // El esquema tiene un unique por (proveedor, día): dos pautas el mismo día
    // no son un pedido dos veces, son un error de dedo.
    const dias = new Set(pautas.map((p) => p.orderWeekday))
    if (dias.size !== pautas.length) {
      toast.error('Hay dos pautas el mismo día', {
        description: 'Un proveedor solo puede tener una hora de corte por día.',
      })
      return
    }

    iniciar(async () => {
      const resultado = await guardarPauta(proveedor.id, pautas)
      if (resultado.ok) {
        toast.success('Pauta guardada')
        onCerrar()
        router.refresh()
      } else {
        toast.error(resultado.mensaje)
      }
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => (v ? null : onCerrar())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pauta de {proveedor.nombre}</DialogTitle>
          <DialogDescription>
            Qué días se le pide y hasta qué hora. De aquí salen el aviso de corte y la fecha
            de entrega prevista; sin pauta, ninguna de las dos cosas existe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {pautas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin pauta definida. Añade una línea por cada día de pedido.
            </p>
          ) : (
            pautas.map((p, i) => (
              <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`dia-${i}`} className="text-xs">
                    Día de pedido
                  </Label>
                  <Select
                    id={`dia-${i}`}
                    value={p.orderWeekday}
                    onChange={(e) => actualizar(i, { orderWeekday: Number(e.target.value) })}
                  >
                    {DIAS_SEMANA.map((d, indice) => (
                      <option key={d} value={indice}>
                        {d}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`hora-${i}`} className="text-xs">
                    Hora de corte
                  </Label>
                  <Input
                    id={`hora-${i}`}
                    type="time"
                    value={p.cutoffTime}
                    onChange={(e) => actualizar(i, { cutoffTime: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`entrega-${i}`} className="text-xs">
                    Día de entrega
                  </Label>
                  <Select
                    id={`entrega-${i}`}
                    value={p.deliveryWeekday ?? ''}
                    onChange={(e) =>
                      actualizar(i, {
                        deliveryWeekday: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  >
                    <option value="">Sin definir</option>
                    {DIAS_SEMANA.map((d, indice) => (
                      <option key={d} value={indice}>
                        {d}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor={`plazo-${i}`} className="text-xs">
                      Días hasta entrega
                    </Label>
                    <Input
                      id={`plazo-${i}`}
                      inputMode="numeric"
                      value={p.leadTimeDays}
                      onChange={(e) =>
                        actualizar(i, { leadTimeDays: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Quitar pauta"
                    onClick={() => setPautas((previo) => previo.filter((_, j) => j !== i))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setPautas((previo) => [
                ...previo,
                { orderWeekday: 1, cutoffTime: '10:00', deliveryWeekday: 3, leadTimeDays: 1 },
              ])
            }
          >
            <Plus /> Añadir día
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? <Loader2 className="animate-spin" /> : null}
            Guardar pauta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function GestionProveedores({ proveedores }: { proveedores: ProveedorVista[] }) {
  const [editando, setEditando] = useState<ProveedorVista | null>(null)
  const [creando, setCreando] = useState(false)
  const [pautasDe, setPautasDe] = useState<ProveedorVista | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreando(true)}>
          <Plus /> Nuevo proveedor
        </Button>
      </div>

      {proveedores.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay proveedores"
          descripcion="Créalos a mano o carga el catálogo completo desde un CSV, que los da de alta de una vez."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proveedor</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead className="text-right">Productos</TableHead>
                <TableHead>Pauta</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {proveedores.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.nombre}
                    {!p.activo ? (
                      <Badge variant="hueco" className="ml-2">
                        inactivo
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>{ETIQUETA_CANAL[p.canal]}</TableCell>
                  <TableCell className="text-muted-foreground">{p.contacto || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.productos}</TableCell>
                  <TableCell>
                    {p.pautas.length === 0 ? (
                      <Badge variant="estimado">sin pauta</Badge>
                    ) : (
                      <span className="text-muted-foreground">
                        {plural(p.pautas.length, 'día', 'días')}:{' '}
                        {p.pautas
                          .map((x) => `${DIAS_SEMANA[x.orderWeekday].slice(0, 3)} ${x.cutoffTime}`)
                          .join(', ')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Pauta de ${p.nombre}`}
                      onClick={() => setPautasDe(p)}
                    >
                      <CalendarClock />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Editar ${p.nombre}`}
                      onClick={() => setEditando(p)}
                    >
                      <Pencil />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {creando ? (
        <DialogoProveedor proveedor={null} abierto onCerrar={() => setCreando(false)} />
      ) : null}

      {editando ? (
        <DialogoProveedor
          key={editando.id}
          proveedor={editando}
          abierto
          onCerrar={() => setEditando(null)}
        />
      ) : null}

      {pautasDe ? (
        <DialogoPautas
          key={pautasDe.id}
          proveedor={pautasDe}
          abierto
          onCerrar={() => setPautasDe(null)}
        />
      ) : null}
    </div>
  )
}
