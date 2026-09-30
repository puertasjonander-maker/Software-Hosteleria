import { useMemo, useState } from 'react'
import {
  Copy,
  KeyRound,
  Loader2,
  Mail,
  MailX,
  MoreHorizontal,
  Pencil,
  Power,
  Search,
  Send,
  UserPlus,
} from 'lucide-react'
import { toast } from 'sonner'
import { useOcupado } from '@/lib/ocupado'
import type { RolUsuario } from '@/lib/database.types'
import { ETIQUETA_ROL } from '@/lib/roles'
import { haceTiempo, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
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
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu'
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

/**
 * Usuarios y accesos.
 *
 * La pantalla responde a tres preguntas en este orden: ¿quién tiene acceso?,
 * ¿le ha llegado de verdad? y ¿qué puedo hacer con él? Por eso cada fila lleva su
 * estado de acceso a la vista («aún no ha entrado» es lo que hay que perseguir) y
 * las acciones, que antes eran cuatro controles sueltos por fila, viven en un menú.
 */
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
  const [filtro, setFiltro] = useState('')

  const sinEntrar = usuarios.filter((u) => u.activo && !u.esTu && !u.ultimoAcceso).length

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    if (!q) return usuarios
    return usuarios.filter((u) =>
      `${u.nombre} ${u.email ?? ''} ${boxes.find((b) => b.id === u.clienteId)?.nombre ?? ''}`
        .toLowerCase()
        .includes(q),
    )
  }, [usuarios, filtro, boxes])

  const equipo = visibles.filter((u) => u.rol !== 'cliente')
  const clientes = visibles.filter((u) => u.rol === 'cliente')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="titulo-tarjeta">{plural(usuarios.length, 'persona', 'personas')}</p>
          <p className={cn('texto-meta', sinEntrar > 0 && 'font-medium text-warn')}>
            {sinEntrar > 0
              ? `${sinEntrar} ${sinEntrar === 1 ? 'todavía no ha entrado' : 'todavía no han entrado'}`
              : 'Todos han entrado alguna vez'}
          </p>
        </div>
        <DarAcceso boxes={boxes} onCredencial={setCredencial} onCambio={onCambio} />
      </div>

      {usuarios.length > 8 ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar por nombre, correo o box"
            className="pl-9"
            aria-label="Buscar usuario"
          />
        </div>
      ) : null}

      {usuarios.length === 0 ? (
        <EstadoVacio titulo="Todavía no hay nadie más" />
      ) : (
        <>
          <Seccion titulo="Equipo de Ergobox" usuarios={equipo}>
            {(u) => (
              <FilaUsuario
                key={u.id}
                usuario={u}
                boxes={boxes}
                miId={miId}
                onCredencial={setCredencial}
                onCambio={onCambio}
              />
            )}
          </Seccion>

          <Seccion
            titulo="Dueños de box"
            usuarios={clientes}
            vacio="Todavía no has dado acceso a ningún cliente."
          >
            {(u) => (
              <FilaUsuario
                key={u.id}
                usuario={u}
                boxes={boxes}
                miId={miId}
                onCredencial={setCredencial}
                onCambio={onCambio}
              />
            )}
          </Seccion>
        </>
      )}

      <DialogoCredencial credencial={credencial} onCerrar={() => setCredencial(null)} />
    </div>
  )
}

function Seccion({
  titulo,
  usuarios,
  vacio,
  children,
}: {
  titulo: string
  usuarios: UsuarioFila[]
  vacio?: string
  children: (u: UsuarioFila) => React.ReactNode
}) {
  if (usuarios.length === 0 && !vacio) return null
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 titulo-seccion">
        {titulo}
        <span className="tabular-nums font-medium normal-case tracking-normal">
          {usuarios.length}
        </span>
      </h2>
      {usuarios.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 texto-meta">{vacio}</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
          {usuarios.map(children)}
        </ul>
      )}
    </section>
  )
}

// ── Estado de acceso ─────────────────────────────────────────────────────────

/**
 * Cómo está el acceso de alguien, en una etiqueta.
 *
 * El orden importa: desactivado y sin box mandan sobre todo lo demás porque son lo
 * que explica que alguien «entre pero no vea nada», y «aún no ha entrado» es lo
 * que se quiere perseguir. Un acceso sano no grita: solo dice cuándo fue la última
 * vez.
 */
export function EstadoAcceso({ usuario }: { usuario: UsuarioFila }) {
  let texto: string
  let clase: string

  if (!usuario.activo) {
    texto = 'Desactivado'
    clase = 'bg-muted text-muted-foreground'
  } else if (usuario.rol === 'cliente' && !usuario.clienteId) {
    texto = 'Sin box: no ve nada'
    clase = 'bg-warn-soft text-warn-soft-foreground'
  } else if (!usuario.ultimoAcceso && !usuario.esTu) {
    texto = 'Aún no ha entrado'
    clase = 'bg-warn-soft text-warn-soft-foreground'
  } else if (usuario.contrasenaTemporal) {
    texto = 'Sin elegir contraseña'
    clase = 'bg-warn-soft text-warn-soft-foreground'
  } else {
    // Quien mira la pantalla está dentro por definición, aunque el dato no llegue.
    texto = `Entró ${haceTiempo(usuario.ultimoAcceso ?? new Date())}`
    clase = 'bg-ok-soft text-ok-soft-foreground'
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-micro font-semibold',
        clase,
      )}
    >
      {texto}
    </span>
  )
}

// ── Dar acceso ───────────────────────────────────────────────────────────────

export type PresetAcceso = {
  rol?: 'cliente' | 'tecnico'
  clienteId?: string
  email?: string
  nombre?: string
}

/**
 * Dar acceso a alguien nuevo, en dos tiempos.
 *
 * Se rellena, se revisa y solo entonces se manda. El paso de revisión no es
 * ceremonia: un correo no se puede recuperar, y aquí lo que se manda es una
 * contraseña a una dirección tecleada a mano. Equivocarse de letra significa
 * mandarle las claves de un box a un desconocido.
 *
 * Y el envío es una elección, no lo que pasa por no hacer nada: hay un botón para
 * crear y mandar, y otro para crear sin mandar y dictar la contraseña.
 *
 * Se usa desde administración y desde la ficha de un box, con el box (y el
 * contacto, si lo hay) ya rellenados: dar acceso desde donde se está mirando el
 * box es un toque, no un viaje a otra pantalla.
 */
export function DarAcceso({
  boxes,
  inicial,
  etiqueta = 'Dar acceso',
  variante = 'default',
  onCredencial,
  onCambio,
}: {
  boxes: BoxOpcion[]
  inicial?: PresetAcceso
  etiqueta?: string
  variante?: 'default' | 'outline'
  onCredencial: (c: Credencial) => void
  onCambio: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [revisando, setRevisando] = useState(false)
  const [rol, setRol] = useState<'cliente' | 'tecnico'>(inicial?.rol ?? 'cliente')
  const [email, setEmail] = useState(inicial?.email ?? '')
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  // Arranca en el primer box y no en vacío: con `value=""` el navegador enseña
  // la primera opción mientras el estado dice otra cosa, y se acaba dando acceso
  // al box que no era.
  const [clienteId, setClienteId] = useState(inicial?.clienteId ?? boxes[0]?.id ?? '')
  const [creando, iniciar] = useOcupado()

  const correo = email.trim().toLowerCase()
  const pareceCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)
  const box = boxes.find((b) => b.id === (clienteId || boxes[0]?.id)) ?? null
  const sinBoxes = boxes.length === 0 && rol === 'cliente'

  function abrir() {
    // Cada vez que se abre vuelve a lo que tocaba: el preset manda sobre lo que
    // se quedó a medias la vez anterior.
    setRol(inicial?.rol ?? 'cliente')
    setEmail(inicial?.email ?? '')
    setNombre(inicial?.nombre ?? '')
    setClienteId(inicial?.clienteId ?? boxes[0]?.id ?? '')
    setRevisando(false)
    setAbierto(true)
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
        setAbierto(false)
        onCredencial(r.credencial)
        onCambio()
      } else {
        toast.error(r.mensaje)
      }
    })
  }

  return (
    <>
      <Button variant={variante} onClick={abrir} className="shrink-0">
        <UserPlus /> {etiqueta}
      </Button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          {revisando ? (
            <>
              <DialogHeader>
                <DialogTitle>Repasa antes de mandarlo</DialogTitle>
                <DialogDescription>
                  Un correo no se puede recuperar, y este lleva dentro una contraseña temporal.
                </DialogDescription>
              </DialogHeader>

              <dl className="space-y-3 rounded-lg border bg-muted/40 p-4">
                <Repaso titulo="Correo" valor={correo} destacado />
                <Repaso titulo="Nombre" valor={nombre.trim() || 'Sin nombre'} />
                <Repaso
                  titulo="Entra como"
                  valor={
                    rol === 'cliente'
                      ? `Dueño de ${box?.nombre ?? 'un box'}`
                      : 'Técnico de Ergobox'
                  }
                />
                <Repaso titulo="Podrá" valor={alcanceDelRol(rol)} />
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
                <Button variant="ghost" onClick={() => setRevisando(false)} disabled={creando}>
                  Volver y corregir
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Dar acceso</DialogTitle>
                <DialogDescription>
                  Recibirá un correo con una contraseña temporal y, al entrar, elegirá la suya.
                </DialogDescription>
              </DialogHeader>

              {sinBoxes ? (
                <EstadoVacio
                  titulo="Primero da de alta un box"
                  descripcion="Un usuario cliente sin box asignado no ve nada, así que no tiene sentido crearlo antes."
                />
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
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

                  {rol === 'cliente' ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="alta-box">Box</Label>
                      <Select
                        id="alta-box"
                        value={clienteId}
                        onChange={(e) => setClienteId(e.target.value)}
                      >
                        {boxes.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.nombre}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <Label htmlFor="alta-email">Correo</Label>
                    <Input
                      id="alta-email"
                      type="email"
                      inputMode="email"
                      autoComplete="off"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="antonio@ironbuster.es"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="alta-nombre">Nombre</Label>
                    <Input
                      id="alta-nombre"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder="Antonio"
                    />
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button onClick={() => setRevisando(true)} disabled={!pareceCorreo || sinBoxes}>
                  Revisar
                </Button>
              </DialogFooter>
            </>
          )}
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

// ── Una fila ─────────────────────────────────────────────────────────────────

type Dialogo = 'editar' | 'acceso' | 'desactivar' | null

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
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const [ocupado, iniciar] = useOcupado()
  const nombre = usuario.nombre || usuario.email || 'este usuario'
  const nombreBox = boxes.find((b) => b.id === usuario.clienteId)?.nombre

  function nuevoAcceso(enviarCorreo: boolean) {
    iniciar(async () => {
      const r = await restablecerContrasena(usuario.id, enviarCorreo)
      setDialogo(null)
      if (r.ok) {
        onCredencial(r.credencial)
        onCambio()
      } else {
        toast.error(r.mensaje)
      }
    })
  }

  function alternarActivo() {
    iniciar(async () => {
      const r = await activarUsuario(usuario.id, !usuario.activo, miId)
      setDialogo(null)
      if (r.ok) onCambio()
      else toast.error(r.mensaje)
    })
  }

  // A quien nunca ha entrado no se le «restablece» nada: se le reenvía el acceso.
  const reenviar = !usuario.ultimoAcceso

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        aria-hidden
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-meta font-bold text-secondary-foreground',
          !usuario.activo && 'opacity-50',
        )}
      >
        {iniciales(nombre)}
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn('truncate titulo-tarjeta', !usuario.activo && 'opacity-60')}>
          {usuario.nombre || usuario.email || 'Sin nombre'}
          {usuario.esTu ? (
            <span className="ml-2 texto-micro text-muted-foreground">(tú)</span>
          ) : null}
        </p>
        <p className="truncate texto-meta">
          {[
            usuario.nombre ? usuario.email : null,
            usuario.rol === 'cliente' ? nombreBox : ETIQUETA_ROL[usuario.rol],
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <div className="mt-1.5 sm:hidden">
          <EstadoAcceso usuario={usuario} />
        </div>
      </div>

      <div className="hidden sm:block">
        <EstadoAcceso usuario={usuario} />
      </div>

      <Menu>
        <MenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={ocupado}
            aria-label={`Acciones de ${nombre}`}
          >
            <MoreHorizontal />
          </Button>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem onSelect={() => setDialogo('editar')}>
            <Pencil /> Rol y box
          </MenuItem>
          <MenuItem onSelect={() => setDialogo('acceso')}>
            {reenviar ? <Send /> : <KeyRound />}
            {reenviar ? 'Reenviar acceso' : 'Nueva contraseña'}
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            disabled={usuario.esTu}
            onSelect={() => (usuario.activo ? setDialogo('desactivar') : alternarActivo())}
            className={usuario.activo ? 'text-destructive focus:text-destructive' : undefined}
          >
            <Power /> {usuario.activo ? 'Quitar acceso' : 'Volver a activar'}
          </MenuItem>
        </MenuContent>
      </Menu>

      <EditarAcceso
        abierto={dialogo === 'editar'}
        onCerrar={() => setDialogo(null)}
        usuario={usuario}
        boxes={boxes}
        miId={miId}
        onCambio={onCambio}
      />

      <Dialog open={dialogo === 'acceso'} onOpenChange={(v) => (v ? null : setDialogo(null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reenviar ? `¿Reenviar el acceso a ${nombre}?` : `¿Nueva contraseña para ${nombre}?`}
            </DialogTitle>
            <DialogDescription>
              {reenviar
                ? 'La contraseña de antes no se guarda en ningún sitio, así que se genera una nueva y la anterior deja de valer.'
                : 'La que tiene ahora deja de funcionar en el momento. Al entrar tendrá que elegir una propia.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Button onClick={() => nuevoAcceso(true)} disabled={ocupado || !usuario.email}>
              {ocupado ? <Loader2 className="animate-spin" /> : <Mail />}
              Generar y mandarle el correo
            </Button>
            <Button variant="outline" onClick={() => nuevoAcceso(false)} disabled={ocupado}>
              <MailX />
              Solo generar, la dicto yo
            </Button>
            <Button variant="ghost" onClick={() => setDialogo(null)} disabled={ocupado}>
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogo === 'desactivar'} onOpenChange={(v) => (v ? null : setDialogo(null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Quitar el acceso a {nombre}?</DialogTitle>
            <DialogDescription>
              Deja de ver nada en el momento. No se borra nada: su historial se conserva y
              puedes volver a activarlo cuando quieras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)} disabled={ocupado}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={alternarActivo} disabled={ocupado}>
              {ocupado ? <Loader2 className="animate-spin" /> : null}
              Quitar acceso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}

/**
 * Cambiar el rol y el box de alguien, con el alcance dicho antes de guardar.
 *
 * Es un diálogo y no dos desplegables sueltos en la fila porque cambiar a «Técnico»
 * abre TODOS los boxes, y eso no se deduce de una lista de opciones: hay que
 * leerlo antes de pulsar. Guardar aplica las dos cosas a la vez, así que no hay un
 * estado intermedio en el que alguien sea técnico con un box asignado.
 */
function EditarAcceso({
  abierto,
  onCerrar,
  usuario,
  boxes,
  miId,
  onCambio,
}: {
  abierto: boolean
  onCerrar: () => void
  usuario: UsuarioFila
  boxes: BoxOpcion[]
  miId: string
  onCambio: () => void
}) {
  const [rol, setRol] = useState<RolUsuario>(usuario.rol)
  const [clienteId, setClienteId] = useState(usuario.clienteId ?? '')
  const [guardando, iniciar] = useOcupado()

  function guardar() {
    iniciar(async () => {
      if (rol !== usuario.rol) {
        const r = await cambiarRol(usuario.id, rol, miId)
        if (!r.ok) {
          toast.error(r.mensaje)
          return
        }
      }
      if (rol === 'cliente' && clienteId !== (usuario.clienteId ?? '')) {
        const r = await asignarBox(usuario.id, clienteId || null)
        if (!r.ok) {
          toast.error(r.mensaje)
          return
        }
      }
      toast.success('Acceso actualizado')
      onCerrar()
      onCambio()
    })
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        if (v) {
          setRol(usuario.rol)
          setClienteId(usuario.clienteId ?? '')
        } else onCerrar()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rol y box de {usuario.nombre || usuario.email}</DialogTitle>
          <DialogDescription>El cambio se aplica en cuanto recargue la aplicación.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="editar-rol">Rol</Label>
            <Select
              id="editar-rol"
              value={rol}
              disabled={usuario.esTu}
              onChange={(e) => setRol(e.target.value as RolUsuario)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ETIQUETA_ROL[r]}
                </option>
              ))}
            </Select>
          </div>

          {rol === 'cliente' ? (
            <div className="space-y-1.5">
              <Label htmlFor="editar-box">Box</Label>
              <Select
                id="editar-box"
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
              >
                <option value="">Sin box (no ve nada)</option>
                {boxes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <dl className="rounded-lg border bg-muted/40 p-4">
            <Repaso titulo="Podrá" valor={alcanceDelRol(rol)} />
          </dl>
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

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '·'
  return partes
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Qué alcanza cada rol, en una frase.
 *
 * Es la misma frase que el alta enseña al revisar, y vive aquí porque el cambio de
 * rol tiene que decir lo mismo: que «Técnico» abre todos los boxes es lo que más
 * se olvida al cambiar a alguien desde la lista.
 */
function alcanceDelRol(rol: RolUsuario): string {
  switch (rol) {
    case 'cliente':
      return 'Ver su box: el parque, el historial y las fotos. No puede cambiar nada.'
    case 'tecnico':
      return 'Trabajar en TODOS los boxes: visitas, partes y fotos de cualquier cliente.'
    case 'admin':
      return 'Todos los boxes, y además dar de alta boxes y usuarios y gestionar los accesos.'
  }
}

// ── La contraseña temporal, una sola vez ─────────────────────────────────────

/**
 * El acceso listo, con el texto ya redactado para pegarlo en WhatsApp.
 *
 * No se guarda en ninguna parte legible: si se cierra esta ventana sin copiarla,
 * hay que generar otra. Es incómodo a propósito — una contraseña que se puede
 * volver a consultar es una contraseña guardada en claro. Y por eso mismo la
 * contraseña es temporal: al entrar, el usuario elige la suya.
 */
export function DialogoCredencial({
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
        [
          'Acceso a Ergobox',
          `Entra en: ${window.location.origin}`,
          `Usuario: ${credencial.email}`,
          `Contraseña temporal: ${credencial.contrasena}`,
          '',
          'Al entrar te pedirá elegir tu propia contraseña.',
        ].join('\n'),
      )
      toast.success('Copiado, listo para pegar')
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
            La contraseña es temporal y no se puede volver a consultar: si se pierde, se genera
            otra.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
          <p className="texto-micro uppercase tracking-wide text-muted-foreground">Usuario</p>
          <p className="break-all text-cuerpo font-medium">{credencial?.email}</p>
          <p className="texto-micro uppercase tracking-wide text-muted-foreground">
            Contraseña temporal
          </p>
          <p className="break-all font-mono text-cuerpo font-semibold">{credencial?.contrasena}</p>
        </div>

        {credencial ? <QuePasoConElCorreo correo={credencial.correo} /> : null}

        <Button onClick={copiar}>
          <Copy /> Copiar mensaje para WhatsApp
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
      <p className="texto-meta font-medium text-ok">
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
