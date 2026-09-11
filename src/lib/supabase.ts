import { createClient } from '@supabase/supabase-js'
import { configuracion } from '@/lib/configuracion'
import type { Database } from '@/lib/database.types'

/**
 * El cliente de Supabase. Uno solo, para toda la aplicación.
 *
 * Antes había dos —uno de servidor con cookies y otro de navegador— y las mismas
 * tablas se leían por dos caminos distintos según la pantalla. Uno de los dos
 * siempre iba a ser el que nadie prueba.
 *
 * La clave anónima es pública por diseño: viaja al navegador y se puede leer.
 * Lo que impide que sirva para nada indebido no es esconderla, sino que cada
 * consulta que hace pasa por las políticas de `supabase/migrations/..._rls.sql`,
 * que resuelven quién es el usuario a partir de su token. La clave de servicio,
 * que sí se salta las políticas, no está en ninguna parte de este código: vive en
 * una función de Supabase (`supabase/functions/alta-usuario`).
 */

const { supabaseUrl, supabaseAnonKey } = configuracion()

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // La app no recibe enlaces mágicos ni vuelve de un OAuth: se entra con correo
    // y contraseña. Sin esto, Supabase husmearía el hash de cada URL por nada.
    detectSessionInUrl: false,
  },
})
