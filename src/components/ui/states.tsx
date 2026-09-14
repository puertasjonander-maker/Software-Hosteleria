import * as React from 'react'
import { AlertTriangle, Inbox, RefreshCw, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Los tres estados que la regla 4 del BUILD_SPEC exige en cada vista: vacío,
 * error y sin conexión. Están juntos a propósito — si se escriben uno a uno en
 * cada pantalla, alguno acaba faltando.
 */

export function EstadoVacio({
  titulo,
  descripcion,
  accion,
  icono: Icono = Inbox,
  className,
}: {
  titulo: string
  descripcion?: string
  accion?: React.ReactNode
  icono?: React.ComponentType<{ className?: string }>
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      <Icono className="h-8 w-8 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-cuerpo font-semibold">{titulo}</p>
        {descripcion ? (
          <p className="max-w-sm text-meta text-muted-foreground">{descripcion}</p>
        ) : null}
      </div>
      {accion}
    </div>
  )
}

export function EstadoError({
  titulo = 'No hemos podido cargar esto',
  descripcion,
  onReintentar,
  className,
}: {
  titulo?: string
  descripcion?: string
  onReintentar?: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-6 py-10 text-center',
        className,
      )}
    >
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <div className="space-y-1">
        <p className="text-cuerpo font-semibold">{titulo}</p>
        <p className="max-w-sm text-meta text-muted-foreground">
          {descripcion ?? 'Puede ser un problema de red. Vuelve a intentarlo.'}
        </p>
      </div>
      {/* Siempre con acción de recuperación: un error sin salida es un callejón. */}
      {onReintentar ? (
        <Button variant="outline" onClick={onReintentar}>
          <RefreshCw /> Reintentar
        </Button>
      ) : null}
    </div>
  )
}

/**
 * Aviso de falta de red. Discreto por diseño: durante una visita no puede ser
 * bloqueante, porque lo que se registra se guarda en local igualmente
 * (EBX-205).
 */
export function AvisoSinConexion({
  pendientes = 0,
  className,
}: {
  pendientes?: number
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-meta text-warn',
        className,
      )}
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>
        Sin conexión. {pendientes > 0 ? `${pendientes} ` : ''}
        {pendientes === 1 ? 'cambio se enviará' : 'cambios se enviarán'} al recuperar red.
      </span>
    </div>
  )
}

/**
 * No se ha podido refrescar, pero lo que hay en pantalla sigue siendo lo último
 * que llegó. Sustituye a la pantalla de error completa cuando ya había datos.
 *
 * Existe por un caso real: en mitad de una visita, `onCambio()` dispara una
 * recarga después de cada parte, y basta con que esa petición falle —una nave
 * metálica, un portal cautivo, un móvil que cambió de red— para que la pantalla
 * entera se sustituyera por «No hemos podido cargar esto». El técnico se quedaba
 * sin las doce máquinas que estaba usando, con la cola intacta y sin forma de
 * saberlo. El principio 5 del proyecto lo prohíbe: el sistema nunca bloquea el
 * trabajo.
 */
export function AvisoDesactualizado({
  onReintentar,
  className,
}: {
  onReintentar?: () => void
  className?: string
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-meta text-warn',
        className,
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      {/*
        Sin el mensaje crudo del servidor: «la red se ha ido» no dice nada a
        quien está de pie delante de una máquina abierta. Lo que hace falta saber
        es que lo que ve sigue valiendo.
      */}
      <span className="min-w-[12rem] flex-1">
        No hemos podido ponernos al día. Lo que ves es lo último que llegó.
      </span>
      {onReintentar ? (
        <Button variant="outline" size="sm" onClick={onReintentar}>
          <RefreshCw /> Reintentar
        </Button>
      ) : null}
    </div>
  )
}
