// ─────────────────────────────────────────────────────────────────────────────
// Ergobox — leer el parque de un box desde Notion (EBX-106)
//
// El inventario real vive en Notion, en una base por box. Esta función la lee y
// devuelve una fila por máquina, con las mismas claves que tiene el CSV de la
// plantilla.
//
// **Solo lee.** El alta de las máquinas la sigue haciendo el navegador con la
// sesión de quien pulsa, pasando por las mismas políticas y por el mismo
// previsualizador que el CSV. Eso es deliberado y es lo importante del diseño:
// el camino de escritura ya está probado, y duplicarlo aquí significaría tener
// dos maneras de dar de alta una máquina, con la clave de servicio metida en una
// de ellas. La función existe solo porque el token de Notion no puede bajar al
// navegador; no porque haga falta un servidor para escribir.
//
// Se despliega con:  supabase functions deploy importar-notion
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'jsr:@supabase/supabase-js@2'

/*
 * `x-client-info` y `apikey` no son opcionales: las manda siempre la librería de
 * Supabase, y si el OPTIONS previo no las permite, el navegador corta antes de
 * enviar nada y parece que la función esté caída. Ya pasó una vez.
 */
const CABECERAS_CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ORIGEN_PERMITIDO') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function responder(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CABECERAS_CORS, 'Content-Type': 'application/json' },
  })
}

// ── Lo que Notion devuelve ───────────────────────────────────────────────────

type ValorNotion = {
  type: string
  title?: { plain_text: string }[]
  rich_text?: { plain_text: string }[]
  select?: { name: string } | null
  multi_select?: { name: string }[]
  date?: { start: string } | null
  number?: number | null
  checkbox?: boolean
  formula?: { type: string; string?: string; number?: number; date?: { start: string } | null }
  rollup?: unknown
}

type PaginaNotion = { properties: Record<string, ValorNotion> }

/**
 * Saca el texto de una propiedad, sea del tipo que sea.
 *
 * Notion guarda cada tipo con una forma distinta y no hay un campo común, así
 * que hay que mirar `type` y entrar por la puerta que toque. Lo que no se
 * reconoce devuelve cadena vacía en vez de reventar: una columna rara en la base
 * de un box no puede impedir importar las otras once máquinas.
 */
function comoTexto(valor: ValorNotion | undefined): string {
  if (!valor) return ''

  switch (valor.type) {
    case 'title':
      return (valor.title ?? []).map((t) => t.plain_text).join('').trim()
    case 'rich_text':
      return (valor.rich_text ?? []).map((t) => t.plain_text).join('').trim()
    case 'select':
      return valor.select?.name?.trim() ?? ''
    case 'multi_select':
      return (valor.multi_select ?? []).map((o) => o.name).join(', ')
    case 'date':
      return valor.date?.start ?? ''
    case 'number':
      return valor.number === null || valor.number === undefined ? '' : String(valor.number)
    case 'checkbox':
      return valor.checkbox ? 'sí' : ''
    case 'formula':
      return (
        valor.formula?.string ??
        valor.formula?.date?.start ??
        (valor.formula?.number !== undefined && valor.formula?.number !== null
          ? String(valor.formula.number)
          : '')
      )
    default:
      return ''
  }
}

/**
 * Busca una propiedad por cualquiera de sus nombres posibles.
 *
 * Hay una base de Notion por box y las escribió una persona, así que la misma
 * columna se llama «Nº serie» en una y «Num. serie» en otra. Se compara sin
 * mayúsculas, sin acentos y sin signos, que es lo que hace que «Nº serie»,
 * «N.º Serie» y «numero serie» sean la misma columna.
 */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function buscar(props: Record<string, ValorNotion>, nombres: string[]): ValorNotion | undefined {
  const buscados = nombres.map(normalizar)
  for (const [clave, valor] of Object.entries(props)) {
    if (buscados.includes(normalizar(clave))) return valor
  }
  return undefined
}

/** El título de una página es la máquina, se llame como se llame la columna. */
function titulo(props: Record<string, ValorNotion>): string {
  const porNombre = buscar(props, ['Máquina', 'Maquina', 'Nombre', 'Name'])
  if (porNombre) return comoTexto(porNombre)

  // Toda base de Notion tiene exactamente una propiedad de tipo `title`, así que
  // esto acierta siempre aunque la hayan renombrado a cualquier cosa.
  const deTipoTitulo = Object.values(props).find((v) => v.type === 'title')
  return comoTexto(deTipoTitulo)
}

/**
 * Una página de Notion como una fila del CSV.
 *
 * Las claves son las de la plantilla a propósito: así el navegador se lo pasa
 * tal cual a `interpretarParque()`, que es quien decide qué significa «Servicio
 * hecho» o «Barra olímpica». Traducir esas palabras aquí sería tener el
 * diccionario en dos sitios.
 *
 * Damper, drag factor, importes y trabajo hecho se quedan fuera. Eso no es la
 * ficha de una máquina: es lo que pasó en una visita, y va en un parte.
 */
function comoFila(pagina: PaginaNotion): Record<string, string> {
  const p = pagina.properties

  return {
    nombre: titulo(p),
    tipo: comoTexto(buscar(p, ['Tipo', 'Tipo de máquina'])),
    marca: comoTexto(buscar(p, ['Marca', 'Fabricante'])),
    modelo: comoTexto(buscar(p, ['Modelo'])),
    num_serie: comoTexto(buscar(p, ['Nº serie', 'N.º serie', 'Num serie', 'Número de serie', 'Serie'])),
    ubicacion: comoTexto(buscar(p, ['Ubicación', 'Sala', 'Zona'])),
    estado: comoTexto(buscar(p, ['Estado', 'Semáforo'])),
    cadencia_meses: comoTexto(buscar(p, ['Cadencia', 'Cadencia meses', 'Cada cuántos meses'])),
    ultima_revision: comoTexto(
      buscar(p, ['Fecha de servicio', 'Última revisión', 'Ultima revision', 'Fecha']),
    ),
    notas: comoTexto(buscar(p, ['Notas', 'Observaciones'])),
  }
}

/** El id de una base, venga como id pelado o dentro de una URL de Notion. */
function idDeBase(bruto: string): string | null {
  const limpio = bruto.trim()

  // 32 hexadecimales, con guiones o sin ellos. En una URL van pegados al final
  // del último tramo, justo antes de los parámetros.
  const encontrados = limpio.match(/[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)
  if (!encontrados || encontrados.length === 0) return null

  // El último: una URL de Notion puede llevar delante el id de la página padre.
  return encontrados[encontrados.length - 1].replace(/-/g, '')
}

Deno.serve(async (peticion) => {
  if (peticion.method === 'OPTIONS') return new Response('ok', { headers: CABECERAS_CORS })
  if (peticion.method !== 'POST') return responder({ error: 'Método no permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const claveAnonima = Deno.env.get('SUPABASE_ANON_KEY')!
  const tokenNotion = Deno.env.get('NOTION_TOKEN')

  if (!tokenNotion) {
    return responder(
      {
        error:
          'La conexión con Notion no está configurada. Falta el token de la integración.',
        codigo: 'sin_configurar',
      },
      501,
    )
  }

  // ── Quién llama ────────────────────────────────────────────────────────────
  // Importar es trabajo interno. Se comprueba contra la base de datos y no
  // contra lo que diga la petición.
  const autorizacion = peticion.headers.get('Authorization') ?? ''
  if (!autorizacion.startsWith('Bearer ')) return responder({ error: 'Falta la sesión.' }, 401)

  const comoUsuario = createClient(url, claveAnonima, {
    global: { headers: { Authorization: autorizacion } },
    auth: { persistSession: false },
  })

  const {
    data: { user },
  } = await comoUsuario.auth.getUser()
  if (!user) return responder({ error: 'Tu sesión ha caducado. Vuelve a entrar.' }, 401)

  const { data: perfil } = await comoUsuario
    .from('perfiles')
    .select('rol, activo')
    .eq('id', user.id)
    .maybeSingle()

  if (!perfil || !perfil.activo || !['admin', 'tecnico'].includes(perfil.rol)) {
    return responder({ error: 'Esto es para el equipo de Ergobox.' }, 403)
  }

  let cuerpo: Record<string, unknown>
  try {
    cuerpo = await peticion.json()
  } catch {
    return responder({ error: 'Petición mal formada.' }, 400)
  }

  const base = idDeBase(String(cuerpo.base ?? ''))
  if (!base) {
    return responder(
      { error: 'Eso no parece una base de Notion. Pega la dirección de la base de máquinas.' },
      400,
    )
  }

  // ── Leer la base entera ────────────────────────────────────────────────────
  // Con paginación: Notion devuelve 100 páginas como mucho, y el parque de un
  // box grande puede pasar de ahí. El tope de vueltas es una red de seguridad
  // contra un cursor que no avance, no un límite pensado para el negocio.
  const filas: Record<string, string>[] = []
  let cursor: string | undefined
  let vueltas = 0

  try {
    do {
      const respuesta = await fetch(`https://api.notion.com/v1/databases/${base}/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenNotion}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
      })

      if (!respuesta.ok) {
        const detalle = await respuesta.text()

        if (respuesta.status === 404) {
          return responder(
            {
              error:
                'Notion dice que no encuentra esa base. Lo más habitual es que no esté ' +
                'compartida con la integración de Ergobox: ábrela en Notion, menú de los ' +
                'tres puntos, Conexiones, y añádela.',
            },
            404,
          )
        }
        if (respuesta.status === 401) {
          return responder({ error: 'El token de Notion no vale o ha caducado.' }, 401)
        }

        return responder(
          { error: `Notion ha respondido ${respuesta.status}: ${detalle.slice(0, 200)}` },
          502,
        )
      }

      const datos = (await respuesta.json()) as {
        results: PaginaNotion[]
        has_more: boolean
        next_cursor: string | null
      }

      for (const pagina of datos.results) filas.push(comoFila(pagina))

      cursor = datos.has_more ? (datos.next_cursor ?? undefined) : undefined
      vueltas += 1
    } while (cursor && vueltas < 20)
  } catch (e) {
    return responder(
      { error: `No hemos podido hablar con Notion: ${e instanceof Error ? e.message : String(e)}` },
      502,
    )
  }

  // Las filas sin nombre se quedan fuera aquí. En Notion es normal tener una fila
  // vacía al final de la tabla, y colarla haría que el previsualizador enseñara
  // un problema que no es de nadie.
  const conNombre = filas.filter((f) => f.nombre !== '')

  return responder({ filas: conNombre, leidas: filas.length })
})
