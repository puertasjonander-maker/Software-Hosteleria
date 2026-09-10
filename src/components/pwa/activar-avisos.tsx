'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/** La clave VAPID viaja en base64url y el navegador la quiere como bytes. */
function base64UrlABytes(base64: string): BufferSource {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalizado = (base64 + relleno).replace(/-/g, '+').replace(/_/g, '/')
  const binario = window.atob(normalizado)

  const bytes = new Uint8Array(new ArrayBuffer(binario.length))
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i)
  return bytes
}

type Estado = 'comprobando' | 'no_soportado' | 'sin_clave' | 'desactivado' | 'activado' | 'bloqueado'

/**
 * Alta y baja de los avisos de corte (EBX-501).
 *
 * Pide el permiso solo cuando la persona pulsa, nunca al cargar: un navegador
 * al que le sale el diálogo de notificaciones nada más entrar recibe un "no"
 * automático, y ese "no" no se puede deshacer desde la app.
 */
export function ActivarAvisos() {
  const [estado, setEstado] = useState<Estado>('comprobando')
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setEstado('no_soportado')
      return
    }
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      setEstado('sin_clave')
      return
    }
    if (Notification.permission === 'denied') {
      setEstado('bloqueado')
      return
    }

    navigator.serviceWorker.ready
      .then((registro) => registro.pushManager.getSubscription())
      .then((suscripcion) => setEstado(suscripcion ? 'activado' : 'desactivado'))
      .catch(() => setEstado('desactivado'))
  }, [])

  async function activar() {
    setTrabajando(true)
    try {
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') {
        setEstado(permiso === 'denied' ? 'bloqueado' : 'desactivado')
        return
      }

      const registro = await navigator.serviceWorker.ready
      const suscripcion = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlABytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      })

      const respuesta = await fetch('/api/push/suscribir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(suscripcion.toJSON()),
      })

      if (!respuesta.ok) throw new Error('No se ha podido guardar la suscripción')

      setEstado('activado')
      toast.success('Avisos activados', {
        description: 'Te llegará un recordatorio antes de cada hora de corte.',
      })
    } catch {
      toast.error('No hemos podido activar los avisos', {
        description: 'Vuelve a intentarlo desde el móvil con la app instalada.',
      })
    } finally {
      setTrabajando(false)
    }
  }

  async function desactivar() {
    setTrabajando(true)
    try {
      const registro = await navigator.serviceWorker.ready
      const suscripcion = await registro.pushManager.getSubscription()

      if (suscripcion) {
        await fetch(`/api/push/suscribir?endpoint=${encodeURIComponent(suscripcion.endpoint)}`, {
          method: 'DELETE',
        })
        await suscripcion.unsubscribe()
      }

      setEstado('desactivado')
      toast.success('Avisos desactivados')
    } catch {
      toast.error('No hemos podido desactivarlos')
    } finally {
      setTrabajando(false)
    }
  }

  // Sin claves VAPID o sin soporte del navegador no se enseña nada: un botón
  // que no puede funcionar es peor que ningún botón.
  if (estado === 'comprobando' || estado === 'no_soportado' || estado === 'sin_clave') {
    return null
  }

  if (estado === 'bloqueado') {
    return (
      <p className="text-xs text-muted-foreground">
        Las notificaciones están bloqueadas para este sitio. Se reactivan desde los ajustes del
        navegador.
      </p>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={trabajando}
      onClick={estado === 'activado' ? desactivar : activar}
    >
      {trabajando ? (
        <Loader2 className="animate-spin" />
      ) : estado === 'activado' ? (
        <BellOff />
      ) : (
        <Bell />
      )}
      {estado === 'activado' ? 'Desactivar avisos de corte' : 'Avisarme antes del corte'}
    </Button>
  )
}
