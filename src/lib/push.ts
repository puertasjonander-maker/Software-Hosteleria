import webpush from 'web-push'

/**
 * Envío de notificaciones push (EBX-501).
 *
 * VAPID se configura una sola vez por proceso. Si faltan las claves no se
 * revienta el arranque: el aviso simplemente no sale y el cron lo registra. Un
 * recordatorio que no llega es molesto; una app que no arranca por eso, mucho
 * peor.
 */

let configurado = false

export function pushDisponible(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  )
}

function configurar() {
  if (configurado || !pushDisponible()) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  configurado = true
}

export type Suscripcion = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export type Aviso = {
  title: string
  body: string
  url: string
  tag?: string
}

export type ResultadoEnvio = {
  enviados: number
  /** Suscripciones que el navegador ya no reconoce: hay que borrarlas. */
  caducadas: string[]
}

export async function enviarAviso(
  suscripciones: Suscripcion[],
  aviso: Aviso,
): Promise<ResultadoEnvio> {
  if (!pushDisponible()) return { enviados: 0, caducadas: [] }
  configurar()

  const carga = JSON.stringify(aviso)
  let enviados = 0
  const caducadas: string[] = []

  await Promise.all(
    suscripciones.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          carga,
          { TTL: 3600 }, // Un aviso de corte no sirve de nada mañana.
        )
        enviados += 1
      } catch (error) {
        // 404 y 410 significan que el usuario desinstaló la PWA o revocó el
        // permiso. Se limpian para no reintentar eternamente.
        const codigo = (error as { statusCode?: number }).statusCode
        if (codigo === 404 || codigo === 410) caducadas.push(s.id)
      }
    }),
  )

  return { enviados, caducadas }
}
