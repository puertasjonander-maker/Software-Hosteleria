import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/**
 * Cliente con service role. SALTA RLS.
 *
 * Solo para dos cosas: el alta de usuarios en /admin (crear cuentas en
 * auth.users) y el cron de avisos de la fase 5 (EBX-501), que corre sin usuario. Nunca
 * se importa desde un componente de cliente — si aparece en un bundle de
 * navegador, es un incidente de seguridad.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error(
      'Falta SUPABASE_SERVICE_ROLE_KEY. Configúrala en el entorno del servidor.',
    )
  }

  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
