'use client'

import { useEffect } from 'react'

/**
 * Registra el service worker. Sin él no hay instalación en el móvil ni
 * notificaciones push (MISE-004), y `/pedir` perdería la caché que le permite
 * abrirse con la red caída.
 */
export function RegistroServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    // En desarrollo el SW cachea versiones antiguas y confunde más que ayuda.
    if (process.env.NODE_ENV !== 'production') return

    const registrar = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
        console.warn('No se pudo registrar el service worker', error)
      })
    }

    if (document.readyState === 'complete') registrar()
    else window.addEventListener('load', registrar, { once: true })
  }, [])

  return null
}
