import { useState } from 'react'
import { Copy, KeyRound, Loader2, Mail, MailX, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useOcupado } from '@/lib/ocupado'
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
  invitarUsuario,
  restablecerContrasena,
  type Credencial,
  type UsuarioFila,
} from '@/datos/usuarios'

export type BoxOpcion = { id: string; nombre: string }

const ROLES = Object.keys(ETIQUETA_ROL) as RolUsuario[]

export function GestionUsuarios({
  usuarios,
  boxes,
  miId,
  onCambio,
}: {
  usuarios: UsuarioFila[]
  boxes: BoxOpcion[]
  /** Quién mira. Ni se degrada ni se apaga a sí mismo. */
  miId: string
  onCambio: () => void
}) {
  const [credencial, setCredencial] = useState<Credencial | null>(null)

  return (
    <div className="space-y-4">
      <AltaUsuario boxes={boxes} onCredencial={setCredencial} onCambio={onCambio} />

      <div className="space-y-3">
        <h2 className="titulo-seccion">Usuarios</h2>

        {usuarios.length === 0 ? (
          <EstadoVacio titulo="Todavía no hay nadie más" />
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {usuarios.map((u) => (
              <FilaUsuario
                key={u.id}
                usuario={u}
                boxes={boxes}
                miId={miId}
                onCredencial={setCredencial}
                onCambio={onCambio}
              />
            ))}
          </ul>
        )}
      </div>

      <DialogoCredencial credencial={credencial} onCerrar={() => setCredencial(null)} />
    </div>
  )
}

/**
 * Alta de alguien nuevo, en dos tiempos (EBX-402).
 *
 * Se rellena, se revisa y solo entonces se manda. El paso de revisión no es
 * ceremonia: un correo no se puede recuperar, y aquí lo que se manda es una
 * contraseña a una dirección tecleada a mano. Equivocarse de letra significa
 * mandarle las claves de un box a un desconocido.
 *
 * Y el envío es una elección, no lo que pasa por no hacer nada: hay un botón para
 * crear y mandar, y otro para crear sin mandar y dictar la contraseña como hasta
 * ahora.
 */
function AltaUsuario({
  boxes,
  onCredencial,
  onCambio,
}: {
  boxes: BoxOpcion[]
  onCredencial: (c: Credencial) => void
  onCambio: () => void
}) {
  const [rol, setRol] = useState<'cliente' | 'tecnico'>('cliente')
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  // Arranca en el primer box y no en vacío: con `value=""` el navegador enseña
  // la primera opción mientras el estado dice otra cosa, y se acaba dando acceso
  // al box que no era.
  const [clienteId, setClienteId] = useState(boxes[0]?.id ?? '')
  const [revisando, setRevisando] = useState(false)
  const [creando, iniciar] = useOcupado()

  const correo = email.trim().toLowerCase()
  const pareceCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)
  const box = boxes.find((b) => b.id === (clienteId || boxes[0]?.id)) ?? null

  if (boxes.length === 0 && rol === 'cliente') {
    return (
      <EstadoVacio
        titulo="Primero da de alta un box"
        descripcion="Un usuario cliente sin box asignado no ve nada, así que no tiene sentido crearlo antes."
      />
    )
  }

  function crear(enviarCorreo: boolean) {
    iniciar(async () => {
      const r = await invitarUsuario({
        rol,
        clienteId: rol === 'cliente' ? clienteId || boxes[0].id : null,
        email: correo,
        nombre: nombre.trim(),
        enviarCorreo,
      })

      if (r.ok) {
        setEmail('')
        setNombre('')
        setRevisando(false)
        onCredencial(r.credencial)
        onCambio()
      } else {
        toast.error(r.mensaje)
      }
    })
  }

  return (
    <>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="min-w-[10rem] flex-1 space-y-1.5">
            <Label htmlFor="alta-rol">Quién es</Label>
            <Select
              id="alta-rol"
              value={rol}
              onChange={(e) => setRol(e.target.value as 'cliente' | 'tecnico')}
            >
              <option value="cliente">Dueño de un box</option>
              <option value="tecnico">Técnico de Ergobox</option>
            </Select>
          </div>

          <div className="min-w-[14rem] flex-1 space-y-1.5">
            <Label htmlFor="email">Correo</Label>
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

          {rol === 'cliente' ? (
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
          ) : null}

          <Button onClick={() => setRevisando(true)} disabled={!pareceCorreo}>
            <UserPlus />
            Revisar y dar acceso
          </Button>
        </CardContent>
      </Card>

      <Dialog open={revisando} onOpenChange={(v) => (v ? null : setRevisando(false))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Repasa antes de mandarlo</DialogTitle>
            <DialogDescription>
              Un correo no se puede recuperar, y este lleva dentro una contraseña.
            </DialogDescription>
          </DialogHeader>

          <dl className="space-y-3 rounded-lg border bg-muted/40 p-4">
            <Repaso titulo="Correo" valor={correo} destacado />
            <Repaso titulo="Nombre" valor={nombre.trim() || 'Sin nombre'} />
            <Repaso
              titulo="Entra como"
              valor={rol === 'cliente' ? `Dueño de ${box?.nombre ?? 'un box'}` : 'Técnico de Ergobox'}
            />
            <Repaso
              titulo="Podrá"
              valor={
                rol === 'cliente'
                  ? 'Ver su parque, su historial y sus fotos. No cambiar nada.'
                  : 'Trabajar en todos los boxes: visitas, partes y fotos.'
              }
            />
          </dl>

          <div className="flex flex-col gap-2">
            <Button onClick={() => crear(true)} disabled={creando}>
              {creando ? <Loader2 className="animate-spin" /> : <Mail />}
              Crear y mandarle el correo
            </Button>
            <Button variant="outline" onClick={() => crear(false)} disabled={creando}>
              <MailX />
              Crear sin mandar correo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Repaso({
  titulo,
  valor,
  destacado,
}: {
  titulo: string
  valor: string
  destacado?: boolean
}) {
  return (
    <div>
      <dt className="texto-micro uppercase tracking-wide text-muted-foreground">{titulo}</dt>
      <dd className={destacado ? 'break-all font-mono text-cuerpo font-semibold' : 'text-cuerpo'}>
        {valor}
      </dd>
    </div>
  )
}

function FilaUsuario({
  usuario,
  boxes,
  miId,
  onCredencial,
  onCambio,
}: {
  usuario: UsuarioFila
  boxes: BoxOpcion[]
  miId: string
  onCredencial: (c: Credencial) => void
  onCambio: () => void
}) {
  const [ocupado, iniciar] = useOcupado()

  function correr(accion: () => Promise<{ ok: true } | { ok: false; mensaje: string }>) {
    iniciar(async () => {
      const r = await accion()
      if (r.ok) onCambio()
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
        onChange={(e) => correr(() => cambiarRol(usuario.id, e.target.value as RolUsuario, miId))}
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
              if (r.ok) onCredencial(r.credencial)
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
          onClick={() => correr(() => activarUsuario(usuario.id, !usuario.activo, miId))}
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
  credencial: Credencial | null
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
            La contraseña no se puede volver a consultar: si se pierde, se genera otra.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
          <p className="texto-micro uppercase tracking-wide text-muted-foreground">Usuario</p>
          <p className="break-all text-cuerpo font-medium">{credencial?.email}</p>
          <p className="texto-micro uppercase tracking-wide text-muted-foreground">Contraseña</p>
          <p className="break-all font-mono text-cuerpo font-semibold">{credencial?.contrasena}</p>
        </div>

        {credencial ? <QuePasoConElCorreo correo={credencial.correo} /> : null}

        <Button onClick={copiar}>
          <Copy /> Copiar acceso
        </Button>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Qué pasó con el correo.
 *
 * Se cuenta siempre, incluso cuando salió bien, porque la contraseña sigue a la
 * vista y hay que saber si hace falta dictarla o no. Y «no está configurado» se
 * distingue de «ha fallado» a propósito: lo primero es una tarea pendiente de
 * montar, lo segundo es un problema de ahora mismo.
 */
function QuePasoConElCorreo({ correo }: { correo: Credencial['correo'] }) {
  if (correo.estado === 'no_pedido') {
    return (
      <p className="texto-meta text-muted-foreground">
        No se ha mandado ningún correo. Pásale el acceso tú.
      </p>
    )
  }

  if (correo.estado === 'enviado') {
    return (
      <p className="texto-meta text-ok-foreground">
        Correo enviado. Si no le llega, mira en spam antes de volver a mandarlo.
      </p>
    )
  }

  if (correo.estado === 'sin_configurar') {
    return (
      <p className="texto-meta text-muted-foreground">
        El envío de correo todavía no está montado, así que el usuario está creado pero no ha
        recibido nada. Pásale el acceso tú.
      </p>
    )
  }

  return (
    <p className="texto-meta text-destructive">
      El usuario está creado, pero el correo no ha salido: {correo.detalle}. Pásale el acceso tú.
    </p>
  )
}
