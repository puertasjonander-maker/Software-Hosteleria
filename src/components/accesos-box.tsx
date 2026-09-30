import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, KeyRound } from 'lucide-react'
import type { UsuarioFila } from '@/datos/usuarios'
import type { Credencial } from '@/datos/usuarios'
import { cn } from '@/lib/utils'
import { DarAcceso, DialogoCredencial, EstadoAcceso } from '@/components/gestion-usuarios'

/**
 * Quién entra a este box.
 *
 * Solo para administración. Va en la ficha del box porque es donde se piensa en
 * «¿ya tiene acceso el dueño?», y dar el acceso desde aquí viene con el box y el
 * contacto ya rellenados: un toque y revisar, sin pasar por Administración.
 */
export function AccesosBox({
  box,
  usuarios,
  onCambio,
}: {
  box: { id: string; nombre: string; contactoEmail: string | null; contactoNombre: string | null }
  usuarios: UsuarioFila[]
  onCambio: () => void
}) {
  const [credencial, setCredencial] = useState<Credencial | null>(null)

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="titulo-seccion">Accesos</h2>
        <DarAcceso
          boxes={[{ id: box.id, nombre: box.nombre }]}
          inicial={{
            rol: 'cliente',
            clienteId: box.id,
            email: box.contactoEmail ?? '',
            nombre: box.contactoNombre ?? '',
          }}
          variante="outline"
          onCredencial={setCredencial}
          onCambio={onCambio}
        />
      </div>

      {usuarios.length === 0 ? (
        <div className="rounded-xl border border-dashed p-4">
          <p className="titulo-tarjeta">Nadie de este box tiene acceso todavía</p>
          <p className="mt-1 texto-meta">
            Dáselo al dueño para que vea su parque, el historial de cada máquina y las fotos de
            cada servicio.
          </p>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
          {usuarios.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-4 py-3">
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
              >
                <KeyRound className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('truncate titulo-tarjeta', !u.activo && 'opacity-60')}>
                  {u.nombre || u.email}
                </p>
                {u.nombre ? <p className="truncate texto-meta">{u.email}</p> : null}
              </div>
              <EstadoAcceso usuario={u} />
            </li>
          ))}
        </ul>
      )}

      <Link
        to="/admin"
        className="inline-flex items-center gap-1 texto-meta hover:text-foreground"
      >
        Reenviar accesos o quitarlos, en Administración <ChevronRight className="h-3.5 w-3.5" />
      </Link>

      <DialogoCredencial credencial={credencial} onCerrar={() => setCredencial(null)} />
    </section>
  )
}
