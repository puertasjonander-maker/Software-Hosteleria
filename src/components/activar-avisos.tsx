import { useEffect, useState } from 'react'
import { Bell, BellOff, Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { useOcupado } from '@/lib/ocupado'
import {
  activarAvisos,
  desactivarAvisos,
  enviarAvisoDePrueba,
  estadoAvisos,
  type EstadoAvisos,
} from '@/datos/avisos'
import { Button } from '@/components/ui/button'

/**
 * Activar los avisos de revisión en este dispositivo (EBX-501).
 *
 * "En este dispositivo" es literal y por eso se dice en pantalla: el permiso y la
 * suscripción son del navegador, no de la cuenta. Quien active los avisos en el
 * móvil y espere que también le lleguen al ordenador se quedará esperando, y sin
 * este texto lo leería como que el sistema no funciona.
 */
export function ActivarAvisos() {
  const [estado, setEstado] = useState<EstadoAvisos | null>(null)
  const [trabajando, ejecutar] = useOcupado()

  useEffect(() => {
    let vivo = true
    estadoAvisos().then((e) => {
      if (vivo) setEstado(e)
    })
    return () => {
      vivo = false
    }
  }, [])

  function activar() {
    ejecutar(async () => {
      const r = await activarAvisos()
      if (r.ok) {
        setEstado('activado')
        toast.success('Avisos activados', {
          description: 'Te llegará un recordatorio cuando a una máquina le toque revisión.',
        })
      } else {
        setEstado(await estadoAvisos())
        toast.error(r.mensaje)
      }
    })
  }

  function desactivar() {
    ejecutar(async () => {
      const r = await desactivarAvisos()
      if (r.ok) {
        setEstado('desactivado')
        toast.success('Avisos desactivados en este dispositivo')
      } else {
        toast.error(r.mensaje)
      }
    })
  }

  function probar() {
    ejecutar(async () => {
      const r = await enviarAvisoDePrueba()
      if (r.ok) {
        toast.success('Enviada', { description: 'Debería llegarte en unos segundos.' })
      } else {
        toast.error('No ha llegado a salir', { description: r.mensaje })
      }
    })
  }

  if (estado === null) {
    return <p className="texto-meta">Comprobando…</p>
  }

  if (estado === 'no_soportado') {
    return (
      <p className="texto-meta">
        Este navegador no admite avisos. En el móvil funcionan con la aplicación instalada desde
        el propio navegador, con «Añadir a pantalla de inicio».
      </p>
    )
  }

  if (estado === 'bloqueado') {
    return (
      <p className="texto-meta">
        Las notificaciones están bloqueadas para esta dirección. Se vuelven a permitir desde los
        ajustes del navegador, en el candado de la barra de direcciones.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="texto-meta">
        {estado === 'activado'
          ? 'Activados en este dispositivo. Cada dispositivo se activa por separado.'
          : 'Te avisamos cuando a una máquina le queden menos de dos semanas para su revisión, y otra vez si se pasa de fecha.'}
      </p>

      <div className="flex flex-wrap gap-2">
        {estado === 'activado' ? (
          <>
            <Button variant="outline" disabled={trabajando} onClick={desactivar}>
              {trabajando ? <Loader2 className="animate-spin" /> : <BellOff />}
              Desactivar aquí
            </Button>
            <Button variant="ghost" disabled={trabajando} onClick={probar}>
              <Send /> Enviarme una de prueba
            </Button>
          </>
        ) : (
          <Button disabled={trabajando} onClick={activar}>
            {trabajando ? <Loader2 className="animate-spin" /> : <Bell />}
            Activar avisos
          </Button>
        )}
      </div>
    </div>
  )
}
