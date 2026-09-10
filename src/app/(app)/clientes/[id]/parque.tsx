'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { Semaforo, TipoMaquina } from '@/lib/database.types'
import {
  ETIQUETA_SEMAFORO,
  ETIQUETA_TIPO_MAQUINA,
  ORDEN_SEMAFORO,
  admiteDamper,
} from '@/lib/roles'
import { fecha as formatearFecha, plural } from '@/lib/format'
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
import { EstadoVacio } from '@/components/ui/states'
import { PuntoSemaforo } from '@/components/chip-semaforo'
import { alternarMaquina, guardarMaquina, type DatosMaquina } from '../acciones'

export type MaquinaFila = {
  id: string
  nombre: string
  tipo: TipoMaquina
  marca: string | null
  modelo: string | null
  numSerie: string | null
  ubicacion: string | null
  notas: string | null
  estado: Semaforo
  cadenciaMeses: number | null
  ultimaRevision: string | null
  proximaRevision: string | null
  diasHastaRevision: number | null
  serviciosHechos: number
  activa: boolean
}

const TIPOS = Object.keys(ETIQUETA_TIPO_MAQUINA) as TipoMaquina[]
const ESTADOS = Object.keys(ETIQUETA_SEMAFORO) as Semaforo[]

/** Cómo se lee la próxima revisión en una línea. Null = sin cadencia contratada. */
function textoRevision(m: MaquinaFila): { texto: string; urgente: boolean } | null {
  if (m.diasHastaRevision === null) return null
  if (m.diasHastaRevision < 0) {
    const dias = Math.abs(m.diasHastaRevision)
    return { texto: `vencida hace ${dias} ${plural(dias, 'día', 'días')}`, urgente: true }
  }
  if (m.diasHastaRevision === 0) return { texto: 'toca hoy', urgente: true }
  return {
    texto: `en ${m.diasHastaRevision} ${plural(m.diasHastaRevision, 'día', 'días')}`,
    urgente: m.diasHastaRevision <= 14,
  }
}

export function Parque({
  clienteId,
  maquinas,
}: {
  clienteId: string
  maquinas: MaquinaFila[]
}) {
  const router = useRouter()
  const [editando, setEditando] = useState<MaquinaFila | null>(null)
  const [creando, setCreando] = useState(false)
  const [ocupado, iniciar] = useTransition()

  /*
   * Orden: primero lo que pide atención. Rojo, luego ámbar, luego lo que nunca
   * se ha mirado, y el verde al final. Dentro de cada grupo, lo más vencido
   * arriba. Alfabético dejaría "RowErg 1" antes que un rack en rojo.
   */
  const ordenadas = useMemo(() => {
    const activas = maquinas.filter((m) => m.activa)
    const inactivas = maquinas.filter((m) => !m.activa)
    activas.sort((a, b) => {
      const porEstado = ORDEN_SEMAFORO[a.estado] - ORDEN_SEMAFORO[b.estado]
      if (porEstado !== 0) return porEstado
      const diasA = a.diasHastaRevision ?? Number.POSITIVE_INFINITY
      const diasB = b.diasHastaRevision ?? Number.POSITIVE_INFINITY
      if (diasA !== diasB) return diasA - diasB
      return a.nombre.localeCompare(b.nombre, 'es')
    })
    return [...activas, ...inactivas]
  }, [maquinas])

  function alternar(m: MaquinaFila) {
    iniciar(async () => {
      const r = await alternarMaquina(clienteId, m.id, !m.activa)
      if (r.ok) {
        setEditando(null)
        router.refresh()
      } else {
        toast.error(r.mensaje)
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="titulo-seccion">Parque</h2>
        <Button size="sm" variant="outline" onClick={() => setCreando(true)}>
          <Plus /> Añadir máquina
        </Button>
      </div>

      {maquinas.length === 0 ? (
        <EstadoVacio
          titulo="Este box todavía no tiene parque"
          descripcion="Añade las máquinas una a una, o importa de golpe la hoja que rellenaste en la visita."
        />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {ordenadas.map((m) => {
            const revision = textoRevision(m)
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setEditando(m)}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors duration-rapido ease-estandar hover:bg-accent"
                >
                  <PuntoSemaforo estado={m.estado} />

                  <div className="min-w-0 flex-1">
                    <span className={m.activa ? 'titulo-tarjeta' : 'titulo-tarjeta opacity-60'}>
                      {m.nombre}
                    </span>
                    <p className="mt-0.5 truncate texto-meta">
                      {[
                        ETIQUETA_TIPO_MAQUINA[m.tipo],
                        m.marca,
                        m.numSerie ? `nº ${m.numSerie}` : null,
                        !m.activa ? 'fuera del parque' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    {revision ? (
                      <p
                        className={
                          revision.urgente
                            ? 'texto-micro text-destructive'
                            : 'texto-micro text-muted-foreground'
                        }
                      >
                        {revision.texto}
                      </p>
                    ) : (
                      <p className="texto-micro text-muted-foreground">sin cadencia</p>
                    )}
                    {m.ultimaRevision ? (
                      <p className="texto-micro text-muted-foreground">
                        últ. {formatearFecha(m.ultimaRevision)}
                      </p>
                    ) : null}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <FormularioMaquina
        abierto={creando}
        onCerrar={() => setCreando(false)}
        clienteId={clienteId}
        maquina={null}
      />

      <FormularioMaquina
        abierto={editando !== null}
        onCerrar={() => setEditando(null)}
        clienteId={clienteId}
        maquina={editando}
        onAlternar={editando ? () => alternar(editando) : undefined}
        ocupado={ocupado}
      />
    </div>
  )
}

function FormularioMaquina({
  abierto,
  onCerrar,
  clienteId,
  maquina,
  onAlternar,
  ocupado,
}: {
  abierto: boolean
  onCerrar: () => void
  clienteId: string
  maquina: MaquinaFila | null
  onAlternar?: () => void
  ocupado?: boolean
}) {
  const router = useRouter()
  const [guardando, iniciar] = useTransition()

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const datos = new FormData(e.currentTarget)

    const texto = (clave: string) => {
      const v = String(datos.get(clave) ?? '').trim()
      return v === '' ? null : v
    }

    const cadenciaBruta = texto('cadencia_meses')
    const payload: DatosMaquina = {
      nombre: String(datos.get('nombre') ?? '').trim(),
      tipo: String(datos.get('tipo') ?? 'otro') as TipoMaquina,
      marca: texto('marca'),
      modelo: texto('modelo'),
      numSerie: texto('num_serie'),
      ubicacion: texto('ubicacion'),
      estado: String(datos.get('estado') ?? 'sin_revisar') as Semaforo,
      cadenciaMeses: cadenciaBruta === null ? null : Number(cadenciaBruta),
      ultimaRevision: texto('ultima_revision'),
      notas: texto('notas'),
    }

    if (!payload.nombre) return

    iniciar(async () => {
      const r = await guardarMaquina(clienteId, maquina?.id ?? null, payload)
      if (r.ok) {
        toast.success(maquina ? 'Máquina actualizada' : 'Máquina añadida')
        onCerrar()
        router.refresh()
      } else {
        toast.error(r.mensaje)
      }
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => (v ? null : onCerrar())}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{maquina ? maquina.nombre : 'Añadir máquina'}</DialogTitle>
          <DialogDescription>
            {maquina
              ? `${ETIQUETA_TIPO_MAQUINA[maquina.tipo]} · ${maquina.serviciosHechos} ${plural(
                  maquina.serviciosHechos,
                  'servicio hecho',
                  'servicios hechos',
                )}`
              : 'El nombre es como la llama el box, no como la llama el fabricante.'}
          </DialogDescription>
        </DialogHeader>

        {/* `key` para que el formulario se reinicie al cambiar de máquina: sin
            ella, abrir una segunda ficha reutiliza los valores de la primera. */}
        <form key={maquina?.id ?? 'nueva'} onSubmit={enviar} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              name="nombre"
              required
              defaultValue={maquina?.nombre ?? ''}
              placeholder="RowErg 5"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tipo">Tipo</Label>
              <Select id="tipo" name="tipo" defaultValue={maquina?.tipo ?? 'rowerg'}>
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_TIPO_MAQUINA[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="estado">Estado</Label>
              <Select id="estado" name="estado" defaultValue={maquina?.estado ?? 'sin_revisar'}>
                {ESTADOS.map((s) => (
                  <option key={s} value={s}>
                    {ETIQUETA_SEMAFORO[s]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="marca">Marca</Label>
              <Input
                id="marca"
                name="marca"
                defaultValue={maquina?.marca ?? ''}
                placeholder="Concept2"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="modelo">Modelo</Label>
              <Input
                id="modelo"
                name="modelo"
                defaultValue={maquina?.modelo ?? ''}
                placeholder="Model D"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="num_serie">Nº de serie</Label>
              <Input
                id="num_serie"
                name="num_serie"
                defaultValue={maquina?.numSerie ?? ''}
                // Sin `required`: en una primera visita se anota lo que se ve, y
                // la mitad de los números están borrados o detrás de la máquina.
                placeholder="opcional"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ubicacion">Ubicación</Label>
              <Input
                id="ubicacion"
                name="ubicacion"
                defaultValue={maquina?.ubicacion ?? ''}
                placeholder="sala principal"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cadencia_meses">Cada cuántos meses</Label>
              <Input
                id="cadencia_meses"
                name="cadencia_meses"
                type="number"
                inputMode="numeric"
                min={1}
                max={36}
                defaultValue={maquina?.cadenciaMeses ?? ''}
                placeholder="sin recurrencia"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ultima_revision">Última revisión</Label>
              <Input
                id="ultima_revision"
                name="ultima_revision"
                type="date"
                defaultValue={maquina?.ultimaRevision ?? ''}
              />
            </div>
          </div>

          <p className="texto-meta">
            La próxima revisión se calcula sola con esos dos datos.
            {maquina && admiteDamper(maquina.tipo)
              ? ' El damper y el drag factor se anotan en cada servicio, no aquí.'
              : ''}
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="notas">Notas</Label>
            <Textarea
              id="notas"
              name="notas"
              rows={2}
              defaultValue={maquina?.notas ?? ''}
              placeholder="Lo que conviene recordar"
            />
          </div>

          <DialogFooter className="gap-2">
            {maquina && onAlternar ? (
              <Button
                type="button"
                variant="ghost"
                className="sm:mr-auto"
                disabled={ocupado}
                onClick={onAlternar}
              >
                {maquina.activa ? 'Sacar del parque' : 'Devolver al parque'}
              </Button>
            ) : null}
            <Button type="submit" disabled={guardando}>
              {guardando ? <Loader2 className="animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
