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
const CONFIG = '/config.json'
const SHELL = [DOCUMENTO, CONFIG, '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_SHELL)
      // addAll falla entero si un recurso falla; con allSettled un icono que
      // falte no impide que se instale el resto.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => precachearElBuild())
      .then(() => self.skipWaiting()),
  )
})

/**
 * Los ficheros con huella del build, dentro de la caché.
 *
 * El shell es `index.html`, y `index.html` solo apunta a `/assets/index-<huella>.js`,
 * que a su vez tira del trozo grande y de la hoja de estilos. Con el documento
 * cacheado y el bundle fuera, una apertura sin cobertura enseñaba el HTML, no
 * ejecutaba nada y dejaba `#raiz` vacío: pantalla en blanco, sin ningún estado de
 * error. Medido el 16-sep-2026: 16 pasadas en rojo de 78, todas con la pantalla en
 * blanco, y `ergobox-v2-estaticos` sin existir antes de la recarga en 22 de 22.
 *
 * La lista sale del propio `index.html` cacheado, así que no hay nada que mantener
 * a mano ni que actualizar con cada build: cambia la huella, cambia la lista.
 */
async function precachearElBuild() {
  try {
    const shell = await caches.open(CACHE_SHELL)
    const documento = await shell.match(DOCUMENTO)
    if (!documento) return

    const urls = [...(await documento.text()).matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(
      (coincidencia) => coincidencia[1],
    )
    if (urls.length === 0) return

    // allSettled y no all: un fichero que falte no puede tumbar la instalación
    // entera y dejar al móvil sin aplicación.
    const estaticos = await caches.open(CACHE_ESTATICOS)
    await Promise.allSettled(urls.map((url) => estaticos.add(url)))
  } catch {
    // Sin precarga la aplicación arranca igual en cuanto haya red; lo único que
    // se pierde es el arranque sin cobertura, y el aviso de `index.html` lo dice.
  }
}

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

  /*
   * La configuración, de red primero y de caché si no hay.
   *
   * Sin esto, abrir la aplicación sin cobertura dentro de un box daría "falta
   * configurar": el fichero no se descargaría y la app no sabría a dónde
   * conectarse, justo en el momento en que más importa que arranque. De red
   * primero para que un cambio de claves llegue en cuanto haya señal.
   */
  if (url.pathname === CONFIG) {
    event.respondWith(
      fetch(request)
        .then((respuesta) => {
          if (respuesta.ok) {
            const copia = respuesta.clone()
            caches.open(CACHE_SHELL).then((cache) => cache.put(CONFIG, copia))
          }
          return respuesta
        })
        .catch(() => caches.match(CONFIG).then((c) => c ?? Response.error())),
    )
    return
  }

  if (esEstatico(url)) {
    event.respondWith(
      caches.match(request).then((cacheada) => {
        if (cacheada) return cacheada

        return fetch(request).then(async (respuesta) => {
          if (respuesta.ok) {
            const copia = respuesta.clone()
            /*
             * La escritura se espera DENTRO de la respuesta, no se dispara y se
             * olvida.
             *
             * Con el `cache.put` suelto, el navegador puede apagar el service worker
             * en cuanto responde y la escritura se pierde: el fichero se sirve bien
             * esa vez y no está la siguiente, que es justo la que se hace sin red.
             * Esperarla aquí no cuesta más que el tiempo de escribir en disco y
             * garantiza que lo servido queda guardado — es lo mismo que se buscaba
             * con `event.waitUntil`, sin exponerse a `InvalidStateError` cuando el
             * evento ya no está activo.
             */
            await caches.open(CACHE_ESTATICOS).then((cache) => cache.put(request, copia))
          }
          return respuesta
        })
      }),
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
