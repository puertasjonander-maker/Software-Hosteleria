'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import type { RolUsuario } from '@/lib/database.types'
import { ETIQUETA_ROL } from '@/lib/roles'
import { Badge } from '@/components/ui/badge'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EstadoVacio } from '@/components/ui/states'
import { actualizarUsuario, crearUsuario } from '../acciones'

type Usuario = {
  id: string
  nombre: string
  rol: RolUsuario
  locationId: string | null
  activo: boolean
}

type Referencia = { id: string; nombre: string }

/** Contraseña inicial legible pero no adivinable: se cambia en el primer día. */
function generarContrasena(): string {
  const alfabeto = 'abcdefghijkmnopqrstuvwxyz23456789'
  const azar = new Uint32Array(12)
  crypto.getRandomValues(azar)
  return [...azar].map((n) => alfabeto[n % alfabeto.length]).join('')
}

function DialogoNuevo({
  locales,
  abierto,
  onCerrar,
}: {
  locales: Referencia[]
  abierto: boolean
  onCerrar: () => void
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState<RolUsuario>('barista')
  const [locationId, setLocationId] = useState(locales[0]?.id ?? '')
  const [password, setPassword] = useState(generarContrasena)
  const [guardando, iniciar] = useTransition()

  function crear() {
    iniciar(async () => {
      const resultado = await crearUsuario({
        email,
        password,
        nombre: nombre.trim(),
        rol,
        locationId: rol === 'operador' ? null : locationId,
      })

      if (resultado.ok) {
        toast.success('Usuario creado', {
          description: `Dale estas credenciales: ${email} / ${password}`,
          duration: 20000,
        })
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
          <DialogTitle>Nuevo usuario</DialogTitle>
          <DialogDescription>
            Apunta la contraseña antes de cerrar: no se vuelve a mostrar. Quien entre puede
            cambiarla después.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="us-nombre">Nombre</Label>
            <Input id="us-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="us-email">Correo</Label>
            <Input
              id="us-email"
              type="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="us-rol">Rol</Label>
            <Select
              id="us-rol"
              value={rol}
              onChange={(e) => setRol(e.target.value as RolUsuario)}
            >
              {(['barista', 'encargado', 'operador'] as const).map((r) => (
                <option key={r} value={r}>
                  {ETIQUETA_ROL[r]}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="us-local">Local</Label>
            <Select
              id="us-local"
              value={locationId}
              disabled={rol === 'operador'}
              onChange={(e) => setLocationId(e.target.value)}
            >
              {locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              {rol === 'operador'
                ? 'El operador ve los tres locales.'
                : 'Sus solicitudes se registran en este local.'}
            </p>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="us-password">Contraseña inicial</Label>
            <div className="flex gap-2">
              <Input
                id="us-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="font-mono"
              />
              <Button variant="outline" onClick={() => setPassword(generarContrasena())}>
                Otra
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={crear} disabled={guardando || !email.trim() || !nombre.trim()}>
            {guardando ? <Loader2 className="animate-spin" /> : null}
            Crear usuario
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogoEditar({
  usuario,
  locales,
  abierto,
  onCerrar,
}: {
  usuario: Usuario
  locales: Referencia[]
  abierto: boolean
  onCerrar: () => void
}) {
  const router = useRouter()
  const [nombre, setNombre] = useState(usuario.nombre)
  const [rol, setRol] = useState<RolUsuario>(usuario.rol)
  const [locationId, setLocationId] = useState(usuario.locationId ?? locales[0]?.id ?? '')
  const [activo, setActivo] = useState(usuario.activo)
  const [guardando, iniciar] = useTransition()

  return (
    <Dialog open={abierto} onOpenChange={(v) => (v ? null : onCerrar())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
          <DialogDescription>
            Desactivar a alguien le corta el acceso sin borrar lo que ha registrado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ed-nombre">Nombre</Label>
            <Input id="ed-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ed-rol">Rol</Label>
            <Select id="ed-rol" value={rol} onChange={(e) => setRol(e.target.value as RolUsuario)}>
              {(['barista', 'encargado', 'operador'] as const).map((r) => (
                <option key={r} value={r}>
                  {ETIQUETA_ROL[r]}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ed-local">Local</Label>
            <Select
              id="ed-local"
              value={locationId}
              disabled={rol === 'operador'}
              onChange={(e) => setLocationId(e.target.value)}
            >
              {locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              className="h-4 w-4"
            />
            Usuario activo
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button
            disabled={guardando}
            onClick={() =>
              iniciar(async () => {
                const resultado = await actualizarUsuario(usuario.id, {
                  nombre: nombre.trim(),
                  rol,
                  locationId: rol === 'operador' ? null : locationId,
                  activo,
                })

                if (resultado.ok) {
                  toast.success('Usuario actualizado')
                  onCerrar()
                  router.refresh()
                } else {
                  toast.error(resultado.mensaje)
                }
              })
            }
          >
            {guardando ? <Loader2 className="animate-spin" /> : null}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function GestionUsuarios({
  usuarios,
  locales,
}: {
  usuarios: Usuario[]
  locales: Referencia[]
}) {
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<Usuario | null>(null)

  const nombreLocal = new Map(locales.map((l) => [l.id, l.nombre]))

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreando(true)} disabled={locales.length === 0}>
          <UserPlus /> Nuevo usuario
        </Button>
      </div>

      {locales.length === 0 ? (
        <EstadoVacio
          titulo="Antes hacen falta locales"
          descripcion="Un barista o un encargado tienen que pertenecer a un local. Crea al menos uno."
        />
      ) : usuarios.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay usuarios"
          descripcion="Crea una cuenta por persona que vaya a pedir o recepcionar."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.nombre || 'Sin nombre'}</TableCell>
                  <TableCell>{ETIQUETA_ROL[u.rol]}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.rol === 'operador' ? (
                      'Todos'
                    ) : u.locationId ? (
                      (nombreLocal.get(u.locationId) ?? 'Local desconocido')
                    ) : (
                      <Badge variant="estimado">sin local</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.activo ? (
                      <Badge variant="real">activo</Badge>
                    ) : (
                      <Badge variant="hueco">desactivado</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Editar ${u.nombre}`}
                      onClick={() => setEditando(u)}
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
        <DialogoNuevo locales={locales} abierto onCerrar={() => setCreando(false)} />
      ) : null}

      {editando ? (
        <DialogoEditar
          key={editando.id}
          usuario={editando}
          locales={locales}
          abierto
          onCerrar={() => setEditando(null)}
        />
      ) : null}
    </div>
  )
}
