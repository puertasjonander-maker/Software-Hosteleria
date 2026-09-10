/* eslint-disable no-undef */
/**
 * Service worker de Ergobox.
 *
 * Hace tres cosas y ninguna más:
 *   1. Que la app abra con la red caída, para que la visita no dependa de que
 *      haya cobertura en el sótano del local.
 *   2. Cachear los estáticos del build, que no cambian dentro de una versión.
 *   3. Recibir las notificaciones push de revisión (EBX-501).
 *
 * Lo que NO hace: cachear respuestas de Supabase. Un semáforo servido de caché
 * sería peor que no tener dato — la app diría algo falso con toda confianza.
 *
 * Siendo una aplicación de una sola página, el "shell" es un único documento:
 * `index.html`. Cualquier ruta se resuelve con él y el router decide qué pintar,
 * así que basta con tenerlo en caché para que la app entre sin red desde
 * cualquier dirección.
 */

const VERSION = 'ergobox-v2'
const CACHE_SHELL = `${VERSION}-shell`
const CACHE_ESTATICOS = `${VERSION}-estaticos`

const DOCUMENTO = '/index.html'
const SHELL = [DOCUMENTO, '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_SHELL)
      // addAll falla entero si un recurso falla; con allSettled un icono que
      // falte no impide que se instale el resto.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(claves.filter((c) => !c.startsWith(VERSION)).map((c) => caches.delete(c))),
      )
      .then(() => self.clients.claim()),
  )
})

/** Los ficheros con huella en el nombre: cambian de nombre al cambiar de versión. */
function esEstatico(url) {
  return url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Supabase vive en otro origen, así que esta condición ya deja fuera todos los
  // datos y todas las fotos. No hay nada nuestro que convenga cachear aparte.
  if (url.origin !== self.location.origin) return

  if (esEstatico(url)) {
    event.respondWith(
      caches.match(request).then(
        (cacheada) =>
          cacheada ??
          fetch(request).then((respuesta) => {
            if (respuesta.ok) {
              const copia = respuesta.clone()
              caches.open(CACHE_ESTATICOS).then((cache) => cache.put(request, copia))
            }
            return respuesta
          }),
      ),
    )
    return
  }

  /*
   * Navegación: red primero y el documento cacheado como red de seguridad.
   *
   * Red primero, y no caché primero, para que una versión nueva de la aplicación
   * llegue en cuanto haya cobertura en vez de quedarse una semana servida desde
   * el móvil.
   */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((respuesta) => {
          if (respuesta.ok) {
            const copia = respuesta.clone()
            caches.open(CACHE_SHELL).then((cache) => cache.put(DOCUMENTO, copia))
          }
          return respuesta
        })
        .catch(async () => {
          const cacheada = await caches.match(DOCUMENTO)
          return (
            cacheada ??
            new Response(
              '<!doctype html><meta charset="utf-8"><title>Sin conexión</title>' +
                '<p style="font:16px system-ui;padding:2rem">Sin conexión, y la aplicación ' +
                'todavía no estaba guardada en este móvil. Vuelve a abrirla con cobertura ' +
                'una vez y ya no hará falta.</p>',
              { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
            )
          )
        }),
    )
  }
})

// ── Avisos de revisión (EBX-501) ─────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let datos = {}
  try {
    datos = event.data ? event.data.json() : {}
  } catch {
    datos = { body: event.data ? event.data.text() : '' }
  }

  const titulo = datos.title || 'Ergobox'
  const opciones = {
    body: datos.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    lang: 'es',
    // El aviso lleva a la pantalla accionable, no al inicio.
    data: { url: datos.url || '/visitas' },
    // Un tag por box: si llegan dos avisos del mismo, se sustituyen en vez de
    // apilarse.
    tag: datos.tag || 'ergobox-revision',
    renotify: false,
    requireInteraction: false,
  }

  event.waitUntil(self.registration.showNotification(titulo, opciones))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destino = new URL(event.notification.data?.url || '/visitas', self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const ventana of ventanas) {
        if ('focus' in ventana) {
          ventana.navigate?.(destino)
          return ventana.focus()
        }
      }
      return self.clients.openWindow(destino)
    }),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
