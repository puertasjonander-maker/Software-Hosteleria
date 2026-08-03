import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const esquema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})

/** Guarda la suscripción push del navegador actual para el usuario en sesión. */
export async function POST(request: NextRequest) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sesión no válida' }, { status: 401 })

  const cuerpo = esquema.safeParse(await request.json().catch(() => null))
  if (!cuerpo.success) {
    return NextResponse.json({ error: 'Suscripción mal formada' }, { status: 400 })
  }

  // onConflict sobre endpoint: un mismo móvil que vuelve a suscribirse
  // actualiza sus claves en vez de acumular filas muertas.
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      profile_id: user.id,
      endpoint: cuerpo.data.endpoint,
      p256dh: cuerpo.data.keys.p256dh,
      auth: cuerpo.data.keys.auth,
    },
    { onConflict: 'endpoint' },
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sesión no válida' }, { status: 401 })

  const endpoint = request.nextUrl.searchParams.get('endpoint')
  if (!endpoint) return NextResponse.json({ error: 'Falta el endpoint' }, { status: 400 })

  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)

  return NextResponse.json({ ok: true })
}
