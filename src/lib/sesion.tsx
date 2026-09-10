import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ClienteRow, PerfilRow } from '@/lib/database.types'

/**
 * Quién está dentro, para toda la aplicación.
 *
 * El perfil se pide una vez al entrar y se guarda aquí: es un dato que no cambia
 * durante una sesión y lo necesitan la navegación, los guardas de ruta y media
 * docena de pantallas. Pedirlo en cada una serían seis viajes a Supabase para
 * responder seis veces lo mismo.
 *
 * Que este contexto diga "eres administrador" no te hace administrador. Lo único
 * que decide qué datos salen son las políticas de la base de datos. Esto sirve
 * para no enseñar una pantalla que saldría vacía, y para nada más.
 */

export type Sesion = {
  userId: string
  email: string | null
  perfil: PerfilRow
  /** El box del usuario. Siempre null para un interno: no está atado a ninguno. */
  cliente: ClienteRow | null
}

type Estado = {
  sesion: Sesion | null
  /** Cierto mientras no sepamos todavía si hay sesión o no. */
  cargando: boolean
  /** Vuelve a leer el perfil. Lo usa /admin tras cambiarse el nombre a sí mismo. */
  refrescar: () => Promise<void>
}

const Contexto = createContext<Estado>({
  sesion: null,
  cargando: true,
  refrescar: async () => {},
})

async function cargarSesion(): Promise<Sesion | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  // Sin perfil no hay nada que hacer: la RLS no le concedería una sola fila.
  // Pasa durante el par de segundos que tarda el trigger de alta.
  if (!perfil) return null

  let cliente: ClienteRow | null = null
  if (perfil.cliente_id) {
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', perfil.cliente_id)
      .maybeSingle()
    cliente = data ?? null
  }

  return { userId: user.id, email: user.email ?? null, perfil, cliente }
}

export function ProveedorSesion({ children }: { children: React.ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(null)
  const [cargando, setCargando] = useState(true)

  const refrescar = useCallback(async () => {
    setSesion(await cargarSesion())
  }, [])

  useEffect(() => {
    let vivo = true

    cargarSesion()
      .then((s) => {
        if (!vivo) return
        setSesion(s)
      })
      .finally(() => {
        if (vivo) setCargando(false)
      })

    /*
     * Entrar y salir se reflejan solos. El callback de Supabase no puede ser
     * `async` ni llamar a otro método del cliente dentro: se queda bloqueado.
     * Por eso el trabajo real sale a un microtask.
     */
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') {
        setSesion(null)
        return
      }
      if (evento === 'SIGNED_IN' || evento === 'USER_UPDATED') {
        void Promise.resolve().then(async () => {
          const s = await cargarSesion()
          if (vivo) setSesion(s)
        })
      }
    })

    return () => {
      vivo = false
      subscription.unsubscribe()
    }
  }, [])

  const valor = useMemo(() => ({ sesion, cargando, refrescar }), [sesion, cargando, refrescar])

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSesion(): Estado {
  return useContext(Contexto)
}

/**
 * La sesión dando por hecho que existe.
 *
 * Solo se llama desde dentro de una ruta protegida, que es la que ya ha esperado
 * a que cargue y ha mandado al login si no había. Ahorra un `if (!sesion)` en
 * cada pantalla que no podría pasar nunca.
 */
export function useSesionActiva(): Sesion {
  const { sesion } = useSesion()
  if (!sesion) throw new Error('useSesionActiva fuera de una ruta protegida')
  return sesion
}

export async function salir() {
  await supabase.auth.signOut()
}
