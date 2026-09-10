'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Semaforo, TipoMaquina } from '@/lib/database.types'
import type { MaquinaFila } from '@/lib/parque'
import { ETIQUETA_SEMAFORO, ETIQUETA_TIPO_MAQUINA, admiteDamper } from '@/lib/roles'
import { plural } from '@/lib/format'
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
import { alternarMaquina, guardarMaquina, type DatosMaquina } from '../acciones'

/**
 * La ficha de una máquina, editable (EBX-102, EBX-104).
 *
 * Sale del listado del parque para poder abrirse también desde la pantalla de la
 * máquina, que es donde vive el historial. El alta y la edición son el mismo
 * formulario a propósito: son los mismos campos y separarlos duplicaría la
 * validación.
 */

const TIPOS = Object.keys(ETIQUETA_TIPO_MAQUINA) as TipoMaquina[]
const ESTADOS = Object.keys(ETIQUETA_SEMAFORO) as Semaforo[]

export function FormularioMaquina({
  abierto,
  onCerrar,
  clienteId,
  maquina,
}: {
  abierto: boolean
  onCerrar: () => void
  clienteId: string
  /** Null = alta. */
  maquina: MaquinaFila | null
}) {
  const router = useRouter()
  const [guardando, iniciar] = useTransition()
  const [alternando, iniciarAlternar] = useTransition()

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

  /**
   * Sacar del parque no borra: deja la máquina inactiva con su historial intacto,
   * que es la prueba del trabajo cobrado. La base de datos escribe la baja en el
   * histórico por su cuenta.
   */
  function alternar() {
    if (!maquina) return
    iniciarAlternar(async () => {
      const r = await alternarMaquina(clienteId, maquina.id, !maquina.activa)
      if (r.ok) {
        toast.success(maquina.activa ? 'Fuera del parque' : 'De vuelta en el parque')
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
              ? `${ETIQUETA_TIPO_MAQUINA[maquina.tipo]} · ${plural(
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
            {maquina ? (
              <Button
                type="button"
                variant="ghost"
                className="sm:mr-auto"
                disabled={alternando || guardando}
                onClick={alternar}
              >
                {alternando ? <Loader2 className="animate-spin" /> : null}
                {maquina.activa ? 'Sacar del parque' : 'Devolver al parque'}
              </Button>
            ) : null}
            <Button type="submit" disabled={guardando || alternando}>
              {guardando ? <Loader2 className="animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
