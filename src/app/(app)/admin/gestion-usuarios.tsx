'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, KeyRound, Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import type { RolUsuario } from '@/lib/database.types'
import { ETIQUETA_ROL } from '@/lib/roles'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EstadoVacio } from '@/components/ui/states'
import {
  activarUsuario,
  asignarBox,
  cambiarRol,
  invitarDuenoBox,
  restablecerContrasena,
} from './acciones'

export type UsuarioFila = {
  id: string
  nombre: string
  email: string | null
  rol: RolUsuario
  clienteId: string | null
  activo: boolean
  creado: string
  /** El usuario que está mirando la pantalla. No puede degradarse ni apagarse. */
  esTu: boolean
}

export type BoxOpcion = { id: string; nombre: string }

const ROLES = Object.keys(ETIQUETA_ROL) as RolUsuario[]

export function GestionUsuarios({
  usuarios,
  boxes,
}: {
  usuarios: UsuarioFila[]
  boxes: BoxOpcion[]
}) {
  const [credencial, setCredencial] = useState<{ email: string; contrasena: string } | null>(null)

  return (
    <div className="space-y-4">
      <AltaDuenoBox boxes={boxes} onCredencial={setCredencial} />

      <div className="space-y-3">
        <h2 className="titulo-seccion">Usuarios</h2>

        {usuarios.length === 0 ? (
          <EstadoVacio titulo="Todavía no hay nadie más" />
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {usuarios.map((u) => (
              <FilaUsuario key={u.id} usuario={u} boxes={boxes} onCredencial={setCredencial} />
            ))}
          </ul>
        )}
      </div>

      <DialogoCredencial credencial={credencial} onCerrar={() => setCredencial(null)} />
    </div>
  )
}

/** Alta del dueño de un box: correo, nombre y a qué box se le da acceso. */
function AltaDuenoBox({
  boxes,
  onCredencial,
}: {
  boxes: BoxOpcion[]
  onCredencial: (c: { email: string; contrasena: string }) => void
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  // Arranca en el primer box y no en vacío: con `value=""` el navegador enseña
  // la primera opción mientras el estado dice otra cosa, y se acaba dando acceso
  // al box que no era.
  const [clienteId, setClienteId] = useState(boxes[0]?.id ?? '')
  const [creando, iniciar] = useTransition()

  if (boxes.length === 0) {
    return (
      <EstadoVacio
        titulo="Primero da de alta un box"
        descripcion="Un usuario cliente sin box asignado no ve nada, así que no tiene sentido crearlo antes."
      />
    )
  }

  function crear() {
    const destino = clienteId || boxes[0].id
    iniciar(async () => {
      const r = await invitarDuenoBox(destino, email, nombre)
      if (r.ok) {
        setEmail('')
        setNombre('')
        onCredencial({ email: r.email, contrasena: r.contrasena })
        router.refresh()
      } else {
        toast.error(r.mensaje)
      }
    })
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 pt-6">
        <div className="min-w-[14rem] flex-1 space-y-1.5">
          <Label htmlFor="email">Correo del dueño</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="antonio@ironbuster.es"
          />
        </div>

        <div className="min-w-[10rem] flex-1 space-y-1.5">
          <Label htmlFor="nombre">Nombre</Label>
          <Input
            id="nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Antonio"
          />
        </div>

        <div className="min-w-[12rem] flex-1 space-y-1.5">
          <Label htmlFor="box">Box</Label>
          <Select id="box" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            {boxes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </Select>
        </div>

        <Button onClick={crear} disabled={creando || email.trim() === ''}>
          {creando ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Dar acceso
        </Button>
      </CardContent>
    </Card>
  )
}

function FilaUsuario({
  usuario,
  boxes,
  onCredencial,
}: {
  usuario: UsuarioFila
  boxes: BoxOpcion[]
  onCredencial: (c: { email: string; contrasena: string }) => void
}) {
  const router = useRouter()
  const [ocupado, iniciar] = useTransition()

  function correr(accion: () => Promise<{ ok: true } | { ok: false; mensaje: string }>) {
    iniciar(async () => {
      const r = await accion()
      if (r.ok) router.refresh()
      else toast.error(r.mensaje)
    })
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3">
      <div className="min-w-[10rem] flex-1">
        {/* `truncate`: un correo largo haciendo de nombre se metía por encima del
            selector de rol en escritorio. */}
        <p className={usuario.activo ? 'truncate titulo-tarjeta' : 'truncate titulo-tarjeta opacity-60'}>
          {usuario.nombre || usuario.email || 'Sin nombre'}
          {usuario.esTu ? <span className="ml-2 texto-micro text-muted-foreground">(tú)</span> : null}
        </p>
        {/* El correo no se repite cuando ya está haciendo de nombre: sin esto, un
            usuario recién creado sin nombre salía con su dirección dos veces. */}
        <p className="truncate texto-meta">
          {[usuario.nombre ? usuario.email : null, !usuario.activo ? 'desactivado' : null]
            .filter(Boolean)
            .join(' · ') || ' '}
        </p>
      </div>

      <Select
        aria-label={`Rol de ${usuario.nombre || usuario.email}`}
        className="h-11 w-auto min-w-[9rem] sm:h-9"
        value={usuario.rol}
        disabled={ocupado || usuario.esTu}
        onChange={(e) => correr(() => cambiarRol(usuario.id, e.target.value as RolUsuario))}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ETIQUETA_ROL[r]}
          </option>
        ))}
      </Select>

      {/* El selector de box solo tiene sentido para un cliente: un interno ve
          todos y la base de datos no le deja tener uno asignado. */}
      {usuario.rol === 'cliente' ? (
        <Select
          aria-label={`Box de ${usuario.nombre || usuario.email}`}
          className="h-11 w-auto min-w-[10rem] sm:h-9"
          value={usuario.clienteId ?? ''}
          disabled={ocupado}
          onChange={(e) => correr(() => asignarBox(usuario.id, e.target.value || null))}
        >
          <option value="">Sin box (no ve nada)</option>
          {boxes.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nombre}
            </option>
          ))}
        </Select>
      ) : (
        <span className="texto-meta text-muted-foreground">Ve todos los boxes</span>
      )}

      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={ocupado}
          title="Generar una contraseña nueva"
          onClick={() =>
            iniciar(async () => {
              const r = await restablecerContrasena(usuario.id)
              if (r.ok) onCredencial({ email: r.email, contrasena: r.contrasena })
              else toast.error(r.mensaje)
            })
          }
        >
          <KeyRound />
          <span className="sr-only">Nueva contraseña</span>
        </Button>

        <Button
          size="sm"
          variant="ghost"
          disabled={ocupado || usuario.esTu}
          onClick={() => correr(() => activarUsuario(usuario.id, !usuario.activo))}
        >
          {usuario.activo ? 'Desactivar' : 'Activar'}
        </Button>
      </div>
    </li>
  )
}

/**
 * La contraseña temporal, una sola vez.
 *
 * No se guarda en ninguna parte legible: si se cierra esta ventana sin copiarla,
 * hay que generar otra. Es incómodo a propósito — una contraseña que se puede
 * volver a consultar es una contraseña guardada en claro.
 */
function DialogoCredencial({
  credencial,
  onCerrar,
}: {
  credencial: { email: string; contrasena: string } | null
  onCerrar: () => void
}) {
  async function copiar() {
    if (!credencial) return
    try {
      await navigator.clipboard.writeText(
        `Acceso a Ergobox\nUsuario: ${credencial.email}\nContraseña: ${credencial.contrasena}`,
      )
      toast.success('Copiado')
    } catch {
      // Sin permiso de portapapeles (o sin HTTPS) queda a la vista para teclearla.
      toast.error('No hemos podido copiar. Apúntala antes de cerrar.')
    }
  }

  return (
    <Dialog open={credencial !== null} onOpenChange={(v) => (v ? null : onCerrar())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Acceso listo</DialogTitle>
          <DialogDescription>
            Cópiala y pásasela ahora. No se puede volver a consultar: si se pierde, se genera otra.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
          <p className="texto-micro uppercase tracking-wide text-muted-foreground">Usuario</p>
          <p className="break-all text-cuerpo font-medium">{credencial?.email}</p>
          <p className="texto-micro uppercase tracking-wide text-muted-foreground">Contraseña</p>
          <p className="break-all font-mono text-cuerpo font-semibold">{credencial?.contrasena}</p>
        </div>

        <Button onClick={copiar}>
          <Copy /> Copiar acceso
        </Button>
      </DialogContent>
    </Dialog>
  )
}
