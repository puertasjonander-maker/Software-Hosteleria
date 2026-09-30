/**
 * Registra el service worker.
 *
 * Sin él no hay instalación en el móvil, ni notificaciones push, ni la caché que
 * permite que la app se abra con la red caída dentro de un local.
 *
 * Fuera de React a propósito: no pinta nada, no depende de ningún estado y solo
 * tiene que pasar una vez por carga. Como componente vacío obligaba a montarlo en
 * el árbol y a explicar por qué devolvía null.
 */
export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  // En desarrollo el SW cachea versiones antiguas y confunde más que ayuda.
  if (!import.meta.env.PROD) return

  const registrar = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.warn('No se pudo registrar el service worker', error)
    })
  }

  if (document.readyState === 'complete') registrar()
  else window.addEventListener('load', registrar, { once: true })
}
