'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { guardarCliente, type DatosCliente } from '../acciones'

export type DatosBox = DatosCliente & { id: string }

/**
 * Edición de la ficha del box.
 *
 * Solo para administración: dar de alta y editar boxes es lo mismo que decidir
 * quién existe en el sistema, y la política de `clientes` solo admite ahí a un
 * admin. Un técnico ve la ficha y no ve este botón.
 */
export function FichaBox({ box }: { box: DatosBox }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [guardando, iniciar] = useTransition()

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const datos = new FormData(e.currentTarget)

    const texto = (clave: string) => {
      const v = String(datos.get(clave) ?? '').trim()
      return v === '' ? null : v
    }

    const nombre = String(datos.get('nombre') ?? '').trim()
    if (!nombre) return

    iniciar(async () => {
      const r = await guardarCliente(box.id, {
        nombre,
        direccion: texto('direccion'),
        poblacion: texto('poblacion'),
        contactoNombre: texto('contacto_nombre'),
        contactoTelefono: texto('contacto_telefono'),
        contactoEmail: texto('contacto_email'),
        notas: texto('notas'),
        activo: datos.get('activo') === 'on',
      })
      if (r.ok) {
        toast.success('Box actualizado')
        setAbierto(false)
        router.refresh()
      } else {
        toast.error(r.mensaje)
      }
    })
  }

  return (
    <>
      <Button variant="outline" className="sm:h-9 sm:px-3" onClick={() => setAbierto(true)}>
        <Pencil /> Editar box
      </Button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar box</DialogTitle>
            <DialogDescription>
              El contacto es a quien se llama para cerrar una fecha de visita.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={enviar} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="box-nombre">Nombre</Label>
              <Input id="box-nombre" name="nombre" required defaultValue={box.nombre} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="box-direccion">Dirección</Label>
              <Input
                id="box-direccion"
                name="direccion"
                defaultValue={box.direccion ?? ''}
                placeholder="C. Felicidad 22"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="box-poblacion">Población</Label>
              <Input
                id="box-poblacion"
                name="poblacion"
                defaultValue={box.poblacion ?? ''}
                placeholder="Pizarra"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="box-contacto">Contacto</Label>
              <Input
                id="box-contacto"
                name="contacto_nombre"
                defaultValue={box.contactoNombre ?? ''}
                placeholder="Antonio"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="box-telefono">Teléfono</Label>
                <Input
                  id="box-telefono"
                  name="contacto_telefono"
                  type="tel"
                  inputMode="tel"
                  defaultValue={box.contactoTelefono ?? ''}
                  placeholder="+34 600 00 00 00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="box-email">Correo</Label>
                <Input
                  id="box-email"
                  name="contacto_email"
                  type="email"
                  defaultValue={box.contactoEmail ?? ''}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="box-notas">Notas</Label>
              <Textarea
                id="box-notas"
                name="notas"
                rows={2}
                defaultValue={box.notas ?? ''}
                placeholder="Acceso, parking, horas a las que no se puede entrar"
              />
            </div>

            <label className="flex items-center gap-2 text-cuerpo">
              <input
                type="checkbox"
                name="activo"
                defaultChecked={box.activo}
                className="h-4 w-4 rounded border-input"
              />
              {/* Se desactiva, no se borra: un box con histórico de servicios no
                  puede desaparecer sin llevarse las fotos por delante. */}
              Box activo
            </label>

            <DialogFooter>
              <Button type="submit" disabled={guardando}>
                {guardando ? <Loader2 className="animate-spin" /> : null}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
