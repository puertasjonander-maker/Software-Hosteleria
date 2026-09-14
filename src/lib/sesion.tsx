import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { conTiempoLimite, ESPERA_MAXIMA_MS, hayRed } from '@/lib/red'
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

/**
 * La última sesión buena, guardada en el dispositivo.
 *
 * Es lo que permite abrir la aplicación sin cobertura. Va en localStorage y no en
 * IndexedDB porque es un objeto pequeño y se necesita en el arranque, antes de
 * que haya nada montado.
 *
 * Guarda también el perfil y el box, que son los que se pedían al servidor en
 * cada carga. Es un dato de interfaz: con él se decide qué pantalla se enseña,
 * no qué filas salen de la base de datos.
 */
const CLAVE_SESION = 'ergobox.sesion'

function guardarSesionCache(sesion: Sesion): void {
  try {
    localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion))
  } catch {
    // Modo privado o almacenamiento lleno: sin caché se trabaja igual, solo que
    // sin cobertura no habrá sesión que recuperar.
  }
}

/** Solo se devuelve si es del mismo usuario: la caché no puede cambiar de manos. */
function leerSesionCache(userId: string): Sesion | null {
  try {
    const crudo = localStorage.getItem(CLAVE_SESION)
    if (!crudo) return null
    const sesion = JSON.parse(crudo) as Sesion
    return sesion.userId === userId ? sesion : null
  } catch {
    return null
  }
}

function olvidarSesionCache(): void {
  try {
    localStorage.removeItem(CLAVE_SESION)
  } catch {
    /* nada que hacer */
  }
}

async function cargarSesion(): Promise<Sesion | null> {
  /*
   * Sin cobertura de verdad —la que dice el navegador— no se llama al servidor.
   * No es una optimización: `getUser` reintenta y la pantalla se quedaba en el
   * esqueleto más de diez segundos antes de rendirse. Con la sesión guardada en el
   * dispositivo, aquí no hay nada que preguntar.
   */
  if (!hayRed()) {
    const guardada = await supabase.auth.getSession()
    const usuario = guardada.data.session?.user ?? null
    return usuario ? leerSesionCache(usuario.id) : null
  }

  const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }))
  const user = data.user

  /*
   * Sin cobertura, `getUser` no puede validar el token contra el servidor y
   * devuelve vacío —y la aplicación acababa en la pantalla de entrar, con un
   * esqueleto de carga delante, dentro de un box sin red—. La sesión sigue
   * guardada en el dispositivo, así que se usa esa identidad. Entrar con ella no
   * concede nada: lo que decide qué datos salen es la RLS, y esto solo decide qué
   * pantalla se enseña.
   */
  const identidad = user ?? (await supabase.auth.getSession()).data.session?.user ?? null
  if (!identidad) return null

  const ultima = leerSesionCache(identidad.id)
  // Sin poder validar contra el servidor, vale la última sesión conocida de ESTE
  // usuario. Si no la hay, se sigue abajo y se intenta leer el perfil.
  if (!user && ultima) return ultima

  /*
   * El perfil, con tope de tiempo. Sin tope, un servidor que no contesta —portal
   * cautivo, red que existe pero no llega— deja la aplicación en el esqueleto todo
   * lo que tarde supabase-js en rendirse (tres reintentos).
   */
  let perfil: PerfilRow | null = null
  try {
    const respuesta = await conTiempoLimite(
      supabase.from('perfiles').select('*').eq('id', identidad.id).maybeSingle(),
      ESPERA_MAXIMA_MS,
    )
    perfil = respuesta.data ?? null
  } catch {
    perfil = null
  }

  /*
   * Sin perfil no hay nada que hacer: la RLS no le concedería una sola fila.
   * Pasa durante el par de segundos que tarda el trigger de alta, y también cada
   * vez que la lectura falla por red. En el segundo caso vale el último perfil que
   * se leyó bien, que es lo que permite trabajar sin cobertura.
   */
  if (!perfil) return ultima

  let cliente: ClienteRow | null = null
  if (perfil.cliente_id) {
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', perfil.cliente_id)
      .maybeSingle()
    cliente = data ?? null
  }

  const sesion: Sesion = { userId: identidad.id, email: identidad.email ?? null, perfil, cliente }
  guardarSesionCache(sesion)
  return sesion
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
  // La caché se va con la sesión: si no, en un dispositivo compartido el siguiente
  // arrancaría con el perfil del anterior.
  olvidarSesionCache()
  await supabase.auth.signOut()
}
