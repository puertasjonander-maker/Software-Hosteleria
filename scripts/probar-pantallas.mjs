/**
 * Las pantallas, contra un Supabase de mentira.
 *
 * Sirve `dist` como lo hará el hosting —cualquier dirección cae en index.html— e
 * intercepta las llamadas a Supabase devolviendo datos fijos. Lo que comprueba no
 * es el diseño: es que la aplicación arranca, que el router lleva a donde dice,
 * que cada rol ve lo suyo y que las pantallas pintan datos en vez de un hueco.
 *
 * Existe porque nada de eso lo coge `tsc`. Los tres fallos de maquetación de la
 * fase 3 y el rebote del cliente en la fase 4 aparecieron con el build en verde.
 *
 * Uso:
 *   npm run build
 *   npx playwright install chromium     # la primera vez
 *   node scripts/probar-pantallas.mjs
 */
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Playwright no es dependencia del proyecto: pesa más que todo lo demás junto y
// solo hace falta para esta prueba. Si está instalado globalmente, se le puede
// indicar dónde con PLAYWRIGHT=/ruta/a/playwright/index.js.
let chromium
try {
  const modulo = await import(process.env.PLAYWRIGHT ?? 'playwright')
  chromium = modulo.chromium ?? modulo.default?.chromium
} catch {
  /* se avisa abajo */
}

if (!chromium) {
  console.error(
    'Falta Playwright. Instálalo con:\n' +
      '  npm i -D playwright && npx playwright install chromium',
  )
  process.exit(1)
}

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '..', 'dist')
const SP = resolve(AQUI, '..', '.capturas')
const PUERTO = 4173

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
}

// ── El servidor estático, con el mismo fallback que _redirects ───────────────
const servidor = createServer(async (peticion, respuesta) => {
  const ruta = decodeURIComponent(new URL(peticion.url, 'http://x').pathname)
  const candidatos = [join(RAIZ, normalize(ruta)), join(RAIZ, 'index.html')]

  for (const fichero of candidatos) {
    try {
      const cuerpo = await readFile(fichero)
      respuesta.writeHead(200, { 'Content-Type': TIPOS[extname(fichero)] ?? 'application/octet-stream' })
      respuesta.end(cuerpo)
      return
    } catch {
      /* siguiente candidato */
    }
  }
  respuesta.writeHead(404).end('no')
})
await new Promise((r) => servidor.listen(PUERTO, r))

// ── Datos de mentira ─────────────────────────────────────────────────────────
const ADMIN = '00000000-0000-0000-0000-0000000000a1'
const CLIENTE = '00000000-0000-0000-0000-0000000000c1'
const BOX_A = '10000000-0000-0000-0000-00000000000a'
const MAQ = '20000000-0000-0000-0000-00000000000a'

const PERFILES = {
  admin: { id: ADMIN, nombre: 'Jon Puertas', email: 'jon@ergobox.es', rol: 'admin', cliente_id: null, activo: true, created_at: '2026-01-01T00:00:00Z' },
  cliente: { id: CLIENTE, nombre: 'Antonio Ruiz', email: 'antonio@ironbuster.es', rol: 'cliente', cliente_id: BOX_A, activo: true, created_at: '2026-02-01T00:00:00Z' },
}

const CLIENTES = [
  { id: BOX_A, nombre: 'CrossFit IronBuster', direccion: 'Pol. La Vega 4', poblacion: 'Pizarra', contacto_nombre: 'Antonio', contacto_telefono: '600123456', contacto_email: null, notas: null, activo: true, created_at: '', updated_at: '' },
  { id: '10000000-0000-0000-0000-00000000000b', nombre: 'CrossFit Marbella', direccion: null, poblacion: 'Marbella', contacto_nombre: null, contacto_telefono: null, contacto_email: null, notas: null, activo: true, created_at: '', updated_at: '' },
]

const PARQUE = [
  { id: MAQ, cliente_id: BOX_A, nombre: 'RowErg 5', tipo: 'rowerg', marca: 'Concept2', modelo: 'Model D', num_serie: '250123', ubicacion: 'sala principal', notas: 'El asiento chirría en frío.', estado: 'rojo', cadencia_meses: 2, ultima_revision: '2026-04-20', proxima_revision: '2026-06-20', activa: true, servicios_hechos: 4, dias_hasta_revision: -82 },
  { id: '20000000-0000-0000-0000-00000000000c', cliente_id: BOX_A, nombre: 'Echo bike 1', tipo: 'air_bike', marca: 'Rogue', modelo: null, num_serie: null, ubicacion: 'altillo', notas: null, estado: 'ambar', cadencia_meses: 3, ultima_revision: '2026-08-30', proxima_revision: '2026-11-30', activa: true, servicios_hechos: 1, dias_hasta_revision: 81 },
  { id: '20000000-0000-0000-0000-00000000000d', cliente_id: BOX_A, nombre: 'SkiErg 1', tipo: 'skierg', marca: 'Concept2', modelo: null, num_serie: '881', ubicacion: null, notas: null, estado: 'verde', cadencia_meses: 6, ultima_revision: '2026-09-01', proxima_revision: '2027-03-01', activa: false, servicios_hechos: 7, dias_hasta_revision: 172 },
]

const MAQUINAS = PARQUE.map((m) => ({ id: m.id, cliente_id: m.cliente_id, estado: m.estado, activa: m.activa, proxima_revision: m.proxima_revision, nombre: m.nombre, tipo: m.tipo }))

const SERVICIOS = [
  { id: '30000000-0000-0000-0000-00000000000a', cliente_id: BOX_A, fecha: '2026-09-08', estado: 'planificado', tecnico_id: ADMIN, notas: null, cerrado_at: null, created_by: ADMIN, created_at: '', updated_at: '' },
  { id: '30000000-0000-0000-0000-00000000000b', cliente_id: BOX_A, fecha: '2026-04-20', estado: 'hecho', tecnico_id: ADMIN, notas: null, cerrado_at: '', created_by: ADMIN, created_at: '', updated_at: '' },
]

const EVENTOS = [
  { id: 'e1', fecha: '2026-09-10', tipo: 'cambio_estado', texto: 'Estado cambiado desde la ficha', estado_resultante: 'rojo', parte_id: null, autor_id: ADMIN, created_at: '2026-09-10T10:00:00Z' },
  { id: 'e2', fecha: '2026-04-20', tipo: 'servicio', texto: 'Cadena engrasada · Raíl limpiado · Monitor comprobado', estado_resultante: 'verde', parte_id: '40000000-0000-0000-0000-00000000000a', autor_id: ADMIN, created_at: '2026-04-20T10:00:00Z' },
  { id: 'e4', fecha: '2026-01-10', tipo: 'alta', texto: 'Concept2 Model D · nº 250123', estado_resultante: 'sin_revisar', parte_id: null, autor_id: ADMIN, created_at: '2026-01-10T10:00:00Z' },
]

const FOTOS = [
  { id: 'f1', parte_id: '40000000-0000-0000-0000-00000000000a', momento: 'antes', ruta: 'a/b/c/1.jpg', orden: 0 },
  { id: 'f2', parte_id: '40000000-0000-0000-0000-00000000000a', momento: 'despues', ruta: 'a/b/c/2.jpg', orden: 0 },
]

const PARTES = [
  { id: '40000000-0000-0000-0000-00000000000a', servicio_id: '30000000-0000-0000-0000-00000000000a', maquina_id: MAQ, trabajo_previsto: 'Limpiar raíl · Engrasar cadena', trabajo_hecho: null, piezas: null, estado_antes: null, estado_despues: null, damper: null, drag_factor: null, minutos: null, importe: null, hecho: false, client_ref: null, created_at: '', updated_at: '', maquinas: { nombre: 'RowErg 5', tipo: 'rowerg', marca: 'Concept2', num_serie: '250123', ubicacion: 'sala principal', estado: 'rojo' } },
]

/** Responde a una consulta de PostgREST mirando la tabla y los filtros. */
function responder(url, rol) {
  const tabla = url.pathname.split('/').pop()
  const q = url.searchParams

  /** Entiende los filtros de PostgREST que usa la aplicación: eq, neq e in. */
  const esDe = (campo, valor) => {
    const filtro = q.get(campo)
    if (!filtro) return true
    if (filtro.startsWith('eq.')) return filtro.slice(3) === String(valor)
    if (filtro.startsWith('neq.')) return filtro.slice(4) !== String(valor)
    if (filtro.startsWith('in.')) return filtro.slice(3).replace(/[()]/g, '').split(',').includes(String(valor))
    return true
  }

  switch (tabla) {
    case 'perfiles': {
      const todos = rol === 'admin' ? Object.values(PERFILES) : [PERFILES.cliente]
      return todos.filter((p) => esDe('id', p.id))
    }
    case 'clientes':
      return (rol === 'admin' ? CLIENTES : CLIENTES.slice(0, 1)).filter((c) => esDe('id', c.id))
    case 'parque_estado': {
      const visibles = rol === 'admin' ? PARQUE : PARQUE.filter((m) => m.cliente_id === BOX_A)
      return visibles.filter((m) => esDe('id', m.id) && esDe('cliente_id', m.cliente_id))
    }
    case 'maquinas':
      return MAQUINAS.filter((m) => esDe('cliente_id', m.cliente_id) && esDe('id', m.id))
    case 'servicios':
      return SERVICIOS.filter((s) => esDe('estado', s.estado))
    case 'partes':
      return PARTES.filter((p) => esDe('servicio_id', p.servicio_id))
    case 'eventos_maquina':
      return EVENTOS.filter((e) => esDe('maquina_id', MAQ))
    case 'fotos':
      return FOTOS
    default:
      return []
  }
}

await mkdir(SP, { recursive: true })

const navegador = await chromium.launch({
  // Permite apuntar a un Chromium ya instalado en el sistema.
  executablePath: process.env.CHROMIUM ?? undefined,
})
const fallos = []
const sesionesVistas = []

function comprobar(descripcion, condicion) {
  if (condicion) console.log('  ok ·', descripcion)
  else {
    console.log('  FALLO ·', descripcion)
    fallos.push(descripcion)
  }
}

async function comoRol(rol, recorrido) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 } })

  await ctx.route('**/ejemplo.supabase.co/**', async (route) => {
    const url = new URL(route.request().url())
    const json = (cuerpo, estado = 200) =>
      route.fulfill({ status: estado, contentType: 'application/json', body: JSON.stringify(cuerpo) })

    if (url.pathname === '/auth/v1/user') {
      return json({ id: PERFILES[rol].id, email: PERFILES[rol].email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' })
    }
    if (url.pathname.startsWith('/storage/v1/object/sign')) {
      return json(FOTOS.map((f) => ({ path: f.ruta, signedURL: `/sin-foto.jpg?p=${f.ruta}`, error: null })))
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      const filas = responder(url, rol)
      const acepta = route.request().headers()['accept'] ?? ''
      if (acepta.includes('vnd.pgrst.object+json')) {
        return filas.length ? json(filas[0]) : json({ message: 'no rows' }, 406)
      }
      return json(filas)
    }
    return json({})
  })

  const pagina = await ctx.newPage()
  pagina.on('pageerror', (e) => fallos.push(`error de página (${rol}): ${e.message}`))
  pagina.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('sin-foto')) sesionesVistas.push(`consola (${rol}): ${m.text()}`)
  })

  // Sesión ya iniciada: la guarda supabase-js en localStorage con esta forma.
  await pagina.goto(`http://localhost:${PUERTO}/entrar`)
  await pagina.evaluate(
    ([id, email]) => {
      const dentroDeUnaHora = Math.floor(Date.now() / 1000) + 3600
      localStorage.setItem(
        'sb-ejemplo-auth-token',
        JSON.stringify({
          access_token: 'falso', token_type: 'bearer', expires_in: 3600, expires_at: dentroDeUnaHora,
          refresh_token: 'falso',
          user: { id, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' },
        }),
      )
    },
    [PERFILES[rol].id, PERFILES[rol].email],
  )

  await recorrido(pagina)
  await ctx.close()
}

async function ir(pagina, ruta) {
  await pagina.goto(`http://localhost:${PUERTO}${ruta}`)
  await pagina.waitForLoadState('networkidle').catch(() => {})
  await pagina.waitForTimeout(300)
}

const texto = (pagina) => pagina.locator('body').innerText()

/**
 * Buscar sin distinguir mayúsculas.
 *
 * Los títulos de sección van en versalitas por CSS y `innerText` los devuelve ya
 * en mayúsculas, así que comparar tal cual falla por algo que en pantalla se lee
 * perfectamente. Ya ha pasado dos veces.
 */
const contiene = (texto, aguja) => texto.toLowerCase().includes(aguja.toLowerCase())

console.log('\n════ Como administrador ════')
await comoRol('admin', async (pagina) => {
  await ir(pagina, '/')
  comprobar('la raíz lleva a las visitas', pagina.url().endsWith('/visitas'))

  await ir(pagina, '/boxes')
  const boxes = await texto(pagina)
  comprobar('la lista de boxes pinta los dos boxes', boxes.includes('IronBuster') && boxes.includes('Marbella'))
  comprobar('y su semáforo', boxes.includes('máquinas'))

  await ir(pagina, `/boxes/${BOX_A}`)
  const box = await texto(pagina)
  comprobar('la ficha del box pinta su nombre', box.includes('CrossFit IronBuster'))
  comprobar('y su parque ordenado por urgencia', box.indexOf('RowErg 5') < box.indexOf('Echo bike 1'))
  comprobar('y la máquina fuera del parque va al final', box.indexOf('SkiErg 1') > box.indexOf('Echo bike 1'))
  comprobar('con el aviso de fuera del parque visible', box.includes('Fuera del parque'))

  await ir(pagina, `/boxes/${BOX_A}/maquinas/${MAQ}`)
  const maquina = await texto(pagina)
  comprobar('la ficha de máquina pinta el historial', maquina.includes('Cadena engrasada'))
  comprobar('con el alta al final', maquina.includes('Alta en el parque'))
  comprobar('y los botones de editar y anotar', maquina.includes('Editar ficha') && maquina.includes('Anotar'))
  await pagina.screenshot({ path: `${SP}/spa-maquina.png`, fullPage: true })

  await ir(pagina, '/panel')
  const panel = await texto(pagina)
  comprobar('el panel cuenta las visitas', panel.includes('visitas terminadas'))
  comprobar('y lista los boxes', panel.includes('IronBuster'))
  await pagina.screenshot({ path: `${SP}/spa-panel.png`, fullPage: true })

  await ir(pagina, '/admin')
  const admin = await texto(pagina)
  comprobar('administración lista a los usuarios', admin.includes('Jon Puertas') && admin.includes('Antonio Ruiz'))
  comprobar('con el correo que ahora sale del perfil', admin.includes('antonio@ironbuster.es'))

  await ir(pagina, '/visitas')
  const visitas = await texto(pagina)
  comprobar(
    'las visitas se agrupan por estado',
    contiene(visitas, 'Por hacer') && contiene(visitas, 'Terminadas'),
  )
  comprobar('y cada una dice cuántas máquinas lleva hechas', visitas.includes('0/1'))

  await ir(pagina, '/ajustes')
  const ajustes = await texto(pagina)
  comprobar('los ajustes enseñan los avisos de revisión', contiene(ajustes, 'Avisos de revisión'))
  comprobar('y dicen algo en vez de quedarse comprobando', !contiene(ajustes, 'Comprobando'))

  await ir(pagina, '/mi-box')
  comprobar('un interno en /mi-box va a su sitio', (await texto(pagina)).includes('Ir a boxes'))

  await ir(pagina, '/direccion-que-no-existe')
  comprobar('una dirección inventada da la pantalla de no encontrada', (await texto(pagina)).includes('Aquí no hay nada'))
})

console.log('\n════ Como cliente ════')
await comoRol('cliente', async (pagina) => {
  await ir(pagina, '/')
  comprobar('la raíz lleva a su box', pagina.url().endsWith('/mi-box'))

  const miBox = await texto(pagina)
  comprobar('ve el nombre de su box', miBox.includes('CrossFit IronBuster'))
  comprobar('y su parque', miBox.includes('RowErg 5'))
  await pagina.screenshot({ path: `${SP}/spa-mi-box.png`, fullPage: true })

  await ir(pagina, `/mi-box/maquinas/${MAQ}`)
  const ficha = await texto(pagina)
  comprobar('abre la ficha de su máquina con historial', ficha.includes('Cadena engrasada'))
  comprobar('sin botones de edición', !ficha.includes('Editar ficha') && !ficha.includes('Anotar'))

  await ir(pagina, '/panel')
  comprobar('el panel le rebota', pagina.url().includes('/sin-permiso'))

  await ir(pagina, '/boxes')
  comprobar('la lista de boxes también', pagina.url().includes('/sin-permiso'))

  await ir(pagina, '/admin')
  comprobar('y administración también', pagina.url().includes('/sin-permiso'))

  await ir(pagina, '/ajustes')
  comprobar('los ajustes son del equipo, no suyos', pagina.url().includes('/sin-permiso'))
})

console.log('\n════ La configuración del despliegue ════')
{
  // config.json manda sobre lo que se cocinó en el build. Es lo que permite
  // cambiar de proyecto de Supabase editando un fichero en el servidor.
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 } })

  await ctx.route('**/config.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        supabaseUrl: 'https://desde-config.supabase.co',
        supabaseAnonKey: 'una-clave-larga-de-mentira-para-la-prueba',
        vapidPublicKey: '',
      }),
    }),
  )

  let hablóConElDeConfig = false
  await ctx.route('**/desde-config.supabase.co/**', (route) => {
    hablóConElDeConfig = true
    return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"no"}' })
  })

  const pagina = await ctx.newPage()
  pagina.on('pageerror', (e) => fallos.push(`error de página (config): ${e.message}`))

  /*
   * Con una sesión guardada, el cliente de Supabase sale a comprobarla nada más
   * arrancar. Es lo que demuestra contra qué servidor se ha construido: sin
   * sesión no llamaría a ninguno y la prueba no probaría nada.
   *
   * La clave de almacenamiento la forma supabase-js con la referencia del
   * proyecto, que aquí es la primera etiqueta del dominio.
   */
  await pagina.goto(`http://localhost:${PUERTO}/entrar`)
  await pagina.evaluate(() => {
    localStorage.setItem(
      'sb-desde-config-auth-token',
      JSON.stringify({
        access_token: 'falso', token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'falso',
        user: { id: '00000000-0000-0000-0000-0000000000a1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' },
      }),
    )
  })

  await ir(pagina, '/boxes')
  comprobar('la app usa el Supabase de config.json y no el del build', hablóConElDeConfig)

  await ctx.close()
}

console.log('\n════ Sin configurar ════')
{
  // Lo primero que se ve si se sube `dist/` sin poner el config.json al lado.
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 } })

  // El hosting, con su regla de reescritura, devuelve index.html para cualquier
  // fichero que no exista. Así que un config.json ausente llega como HTML.
  await ctx.route('**/config.json', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><p>no soy json' }),
  )

  const pagina = await ctx.newPage()
  pagina.on('pageerror', (e) => fallos.push(`error de página (sin configurar): ${e.message}`))

  await pagina.addInitScript(() => {
    // Simula un build sin variables de entorno, que es como se publica.
    Object.defineProperty(window, '__SIN_ENTORNO__', { value: true })
  })

  await ir(pagina, '/')
  const texto0 = await texto(pagina)
  const arrancó = contiene(texto0, 'Ergobox') || contiene(texto0, 'Contraseña')
  comprobar('con un config.json ilegible no se queda en blanco', texto0.trim().length > 0 && arrancó)

  await ctx.close()
}

console.log('\n════ Sin sesión ════')
{
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 } })
  await ctx.route('**/ejemplo.supabase.co/**', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"no"}' }),
  )
  const pagina = await ctx.newPage()
  pagina.on('pageerror', (e) => fallos.push(`error de página (anónimo): ${e.message}`))

  await ir(pagina, `/boxes/${BOX_A}`)
  comprobar('una ruta protegida manda al login', pagina.url().includes('/entrar'))
  comprobar('y el formulario está ahí', (await texto(pagina)).includes('Contraseña'))

  await ctx.close()
}

await navegador.close()
servidor.close()

if (sesionesVistas.length) {
  console.log('\nAvisos de consola:')
  for (const a of new Set(sesionesVistas)) console.log('  ·', a)
}

console.log('')
if (fallos.length) {
  console.log(`════ ${fallos.length} FALLOS ════`)
  process.exit(1)
}
console.log('════ TODO EN ORDEN ════')
