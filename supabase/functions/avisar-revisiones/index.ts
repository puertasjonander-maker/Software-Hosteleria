// ─────────────────────────────────────────────────────────────────────────────
// Ergobox — aviso de próxima revisión (EBX-501, EBX-502)
//
// Corre en Supabase, una vez al día, disparada por cron. Mira qué máquinas tocan,
// se lo manda a quien haya activado los avisos y lo apunta para no repetirse.
//
// Qué máquinas y a quién no se decide aquí: lo deciden `avisos_pendientes()` y
// `destinatarios_avisos()`, que están en SQL y se prueban con
// `scripts/probar-avisos.sql`. Aquí solo se compone el texto y se envía, que es
// lo que no se puede probar sin un servicio de push de verdad.
//
// Dos maneras de entrar:
//
//   · Con la cabecera `x-cron-secret` correcta — el cron. Avisa a todo el mundo y
//     escribe en `aviso_log`.
//   · Con la sesión de un interno y `{"prueba": true}` — el botón de "enviar una
//     de prueba" de la pantalla de ajustes. Manda una notificación fija a los
//     dispositivos de quien lo pulsa y no toca `aviso_log`.
//
// Se despliega con:  supabase functions deploy avisar-revisiones
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const CABECERAS_CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ORIGEN_PERMITIDO') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function responder(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CABECERAS_CORS, 'Content-Type': 'application/json' },
  })
}

type Aviso = {
  maquina_id: string
  maquina: string
  box: string
  proxima_revision: string
  dias: number
}

/** "vencida hace 82 días", "toca hoy", "en 5 días". Igual que en la pantalla. */
function cuando(dias: number): string {
  if (dias < 0) {
    const d = Math.abs(dias)
    return `vencida hace ${d === 1 ? '1 día' : `${d} días`}`
  }
  if (dias === 0) return 'toca hoy'
  return `en ${dias === 1 ? '1 día' : `${dias} días`}`
}

/**
 * El texto del aviso.
 *
 * Una máquina se nombra; varias se cuentan y se nombra la peor. Una notificación
 * con doce nombres se corta en el móvil justo donde empieza lo importante, y la
 * lista completa está a un toque de distancia en la aplicación.
 */
function componer(avisos: Aviso[]): { title: string; body: string } {
  const peor = avisos[0]

  if (avisos.length === 1) {
    return {
      title: `${peor.maquina} · ${peor.box}`,
      body: `Revisión ${cuando(peor.dias)}.`,
    }
  }

  const boxes = new Set(avisos.map((a) => a.box))
  const donde =
    boxes.size === 1 ? `en ${peor.box}` : `en ${boxes.size} boxes`

  return {
    title: `${avisos.length} máquinas tocan revisión`,
    body: `${donde}. La más urgente: ${peor.maquina}, ${cuando(peor.dias)}.`,
  }
}

/** Cada rol aterriza donde puede hacer algo con el aviso. */
function destino(rol: string): string {
  return rol === 'admin' ? '/panel' : '/boxes'
}

Deno.serve(async (peticion) => {
  if (peticion.method === 'OPTIONS') return new Response('ok', { headers: CABECERAS_CORS })
  if (peticion.method !== 'POST') return responder({ error: 'Método no permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const claveAnonima = Deno.env.get('SUPABASE_ANON_KEY')!
  const claveServicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const publica = Deno.env.get('VAPID_PUBLIC_KEY')
  const privada = Deno.env.get('VAPID_PRIVATE_KEY')
  const sujeto = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hola@ergobox.es'

  if (!publica || !privada) {
    return responder({ error: 'Faltan las claves VAPID en el entorno de la función.' }, 500)
  }
  webpush.setVapidDetails(sujeto, publica, privada)

  const admin = createClient(url, claveServicio, { auth: { persistSession: false } })

  let cuerpo: Record<string, unknown> = {}
  try {
    cuerpo = await peticion.json()
  } catch {
    /* el cron llama sin cuerpo */
  }

  // ── Quién llama ────────────────────────────────────────────────────────────
  const secretoEsperado = Deno.env.get('CRON_SECRET')
  const secretoRecibido = peticion.headers.get('x-cron-secret')
  const esCron = Boolean(secretoEsperado) && secretoRecibido === secretoEsperado

  let soloPara: { id: string; rol: string } | null = null

  if (!esCron) {
    const autorizacion = peticion.headers.get('Authorization') ?? ''
    if (!autorizacion.startsWith('Bearer ')) {
      return responder({ error: 'Falta la sesión.' }, 401)
    }

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

    soloPara = { id: user.id, rol: perfil.rol }
  }

  /**
   * Envía a todos los dispositivos de una persona.
   *
   * Un endpoint que responde 404 o 410 es un móvil que desinstaló la aplicación o
   * revocó el permiso: se borra. Sin esto la tabla se llena de direcciones
   * muertas a las que se reintenta todos los días para siempre.
   */
  async function enviarA(perfilId: string, carga: Record<string, unknown>) {
    const { data: suscripciones } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('perfil_id', perfilId)

    let entregados = 0
    const muertas: string[] = []
    let ultimoError: string | null = null

    for (const s of suscripciones ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(carga),
        )
        entregados += 1
      } catch (e) {
        const estado = (e as { statusCode?: number }).statusCode
        if (estado === 404 || estado === 410) muertas.push(s.id)
        else ultimoError = e instanceof Error ? e.message : String(e)
      }
    }

    if (muertas.length > 0) {
      await admin.from('push_subscriptions').delete().in('id', muertas)
    }

    return { entregados, retiradas: muertas.length, error: ultimoError }
  }

  // ── Modo prueba: una notificación fija a quien la pide ─────────────────────
  if (soloPara) {
    if (cuerpo.prueba !== true) {
      return responder({ error: 'Desde la aplicación solo se puede pedir una prueba.' }, 400)
    }

    const r = await enviarA(soloPara.id, {
      title: 'Ergobox · prueba',
      body: 'Si lees esto, los avisos de revisión llegarán a este dispositivo.',
      url: destino(soloPara.rol),
      tag: 'ergobox-prueba',
    })

    if (r.entregados === 0) {
      return responder(
        {
          error:
            r.error ??
            'No hay ningún dispositivo activo. Activa los avisos y vuelve a probar.',
          retiradas: r.retiradas,
        },
        502,
      )
    }
    return responder(r)
  }

  // ── Modo cron: a todo el mundo ─────────────────────────────────────────────
  const { data: destinatarios, error: errorDestinatarios } = await admin.rpc(
    'destinatarios_avisos',
  )

  if (errorDestinatarios) return responder({ error: errorDestinatarios.message }, 500)

  const resumen = {
    personas: 0,
    avisos: 0,
    entregados: 0,
    retiradas: 0,
    fallos: [] as string[],
  }

  for (const d of (destinatarios ?? []) as { perfil_id: string; nombre: string; rol: string }[]) {
    const { data: avisos, error } = await admin.rpc('avisos_pendientes', {
      p_perfil: d.perfil_id,
    })

    if (error) {
      resumen.fallos.push(`${d.nombre}: ${error.message}`)
      continue
    }

    const lista = (avisos ?? []) as Aviso[]
    if (lista.length === 0) continue

    const { title, body } = componer(lista)
    const r = await enviarA(d.perfil_id, {
      title,
      body,
      url: destino(d.rol),
      tag: 'ergobox-revision',
    })

    resumen.retiradas += r.retiradas
    if (r.error) resumen.fallos.push(`${d.nombre}: ${r.error}`)

    /*
     * Solo se apunta lo que de verdad ha salido. Si el envío falló, mañana se
     * vuelve a intentar; darlo por avisado sin haberlo entregado convertiría un
     * problema de red en una revisión perdida.
     */
    if (r.entregados > 0) {
      resumen.personas += 1
      resumen.avisos += lista.length
      resumen.entregados += r.entregados

      const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
      await admin.from('aviso_log').upsert(
        lista.map((a) => ({
          maquina_id: a.maquina_id,
          perfil_id: d.perfil_id,
          enviado_el: hoy,
        })),
        { onConflict: 'maquina_id,perfil_id,enviado_el', ignoreDuplicates: true },
      )
    }
  }

  return responder(resumen)
})
