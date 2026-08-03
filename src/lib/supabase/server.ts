import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/database.types'

/**
 * Cliente de servidor ligado a la sesión del usuario. Todas las consultas pasan
 * por RLS: si una vista de servidor devuelve datos de otro local, el fallo está
 * en la política, no aquí.
 */
export function createClient() {
  const cookieStore = cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Los Server Components no pueden escribir cookies. El refresco de
            // sesión lo hace el middleware, así que ignorarlo aquí es correcto.
          }
        },
      },
    },
  )
}
