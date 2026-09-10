/* eslint-disable no-undef */
/**
 * Service worker de Ergobox.
 *
 * Hace tres cosas y ninguna más:
 *   1. Que la app abra con la red caída, para que `/visitas` no dependa de que
 *      haya cobertura en el sótano del local (CONTEXT.md §10.5).
 *   2. Cachear los estáticos de Next, que no cambian dentro de una versión.
 *   3. Recibir las notificaciones push de corte (MISE-004).
 *
 * Lo que NO hace: cachear respuestas de Supabase. Un stock o un precio servidos
 * de caché serían peor que no tener dato — la app diría algo falso con toda
 * confianza.
 */

const VERSION = 'mise-v1'
const CACHE_SHELL = `${VERSION}-shell`
const CACHE_ESTATICOS = `${VERSION}-estaticos`

const SHELL = ['/offline', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png']

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
        Promise.all(
          claves.filter((c) => !c.startsWith(VERSION)).map((c) => caches.delete(c)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

function esEstaticoNext(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Nada de datos en caché: si no hay red, que la pantalla lo diga.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return

  if (esEstaticoNext(url)) {
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

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((respuesta) => {
          if (respuesta.ok) {
            const copia = respuesta.clone()
            caches.open(CACHE_SHELL).then((cache) => cache.put(request, copia))
          }
          return respuesta
        })
        .catch(async () => {
          const cacheada = await caches.match(request)
          if (cacheada) return cacheada
          const offline = await caches.match('/offline')
          return (
            offline ??
            new Response('Sin conexión', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          )
        }),
    )
  }
})

// ── Avisos de corte (MISE-004) ───────────────────────────────────────────────

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
    // El aviso lleva a la pantalla accionable, no al inicio (MISE-004).
    data: { url: datos.url || '/visitas' },
    // Un tag por box: si llegan dos avisos del mismo, se sustituyen en vez
    // de apilarse.
    tag: datos.tag || 'mise-corte',
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

// El cliente avisa cuando recupera red para que la cola de la visita se vacíe.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
