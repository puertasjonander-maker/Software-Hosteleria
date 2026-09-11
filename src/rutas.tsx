import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { RolUsuario } from '@/lib/database.types'
import { inicioSegunRol } from '@/lib/roles'
import { useSesion } from '@/lib/sesion'
import { Marco } from '@/components/marco'
import { Skeleton } from '@/components/ui/skeleton'

import Entrar from '@/pages/entrar'
import Visitas from '@/pages/visitas'
import Visita from '@/pages/visita'
import Boxes from '@/pages/boxes'
import Box from '@/pages/box'
import ImportarParque from '@/pages/importar-parque'
import Maquina from '@/pages/maquina'
import MiBox from '@/pages/mi-box'
import MiMaquina from '@/pages/mi-maquina'
import Panel from '@/pages/panel'
import Administracion from '@/pages/administracion'
import Ajustes from '@/pages/ajustes'
import SinPermiso from '@/pages/sin-permiso'
import NoEncontrada from '@/pages/no-encontrada'

/**
 * El mapa de la aplicación.
 *
 * Las comprobaciones de rol de aquí son cosmética, igual que lo eran en el
 * servidor: evitan enseñar una pantalla que saldría vacía. Lo que impide de
 * verdad que alguien vea datos que no son suyos son las políticas de la base de
 * datos, y actúan aunque se llame a Supabase sin pasar por ninguna pantalla.
 */
export function Rutas() {
  return (
    <Routes>
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/sin-permiso" element={<SinPermiso />} />

      <Route path="/" element={<AlInicio />} />

      <Route element={<Protegida roles={['admin', 'tecnico']} />}>
        <Route path="/visitas" element={<Visitas />} />
        <Route path="/visitas/:id" element={<Visita />} />
        <Route path="/boxes" element={<Boxes />} />
        <Route path="/boxes/:id" element={<Box />} />
        <Route path="/boxes/:id/importar" element={<ImportarParque />} />
        <Route path="/boxes/:id/maquinas/:maquinaId" element={<Maquina />} />
        <Route path="/ajustes" element={<Ajustes />} />
      </Route>

      <Route element={<Protegida roles={['admin']} />}>
        <Route path="/panel" element={<Panel />} />
        <Route path="/admin" element={<Administracion />} />
      </Route>

      <Route element={<Protegida />}>
        <Route path="/mi-box" element={<MiBox />} />
        <Route path="/mi-box/maquinas/:maquinaId" element={<MiMaquina />} />
      </Route>

      <Route path="*" element={<NoEncontrada />} />
    </Routes>
  )
}

/**
 * La raíz no tiene contenido propio: cada rol entra directamente a su pantalla.
 * El técnico y el administrador a las visitas, el dueño de un box a su box. Un
 * menú intermedio sería un toque de más para quien abre la app dentro del local.
 */
function AlInicio() {
  const { sesion, cargando } = useSesion()
  if (cargando) return <Esperando />
  if (!sesion) return <Navigate to="/entrar" replace />
  return <Navigate to={inicioSegunRol(sesion.perfil.rol)} replace />
}

/**
 * Ruta con sesión, y opcionalmente con rol.
 *
 * Al mandar al login se guarda a dónde se iba: si un aviso push apuntaba a una
 * visita concreta, tras entrar se aterriza ahí y no en el inicio.
 */
function Protegida({ roles }: { roles?: RolUsuario[] }) {
  const { sesion, cargando } = useSesion()
  const ubicacion = useLocation()

  if (cargando) return <Esperando />

  if (!sesion) {
    return <Navigate to="/entrar" replace state={{ destino: ubicacion.pathname + ubicacion.search }} />
  }

  if (roles && !roles.includes(sesion.perfil.rol)) {
    return <Navigate to="/sin-permiso" replace />
  }

  return <Marco />
}

/**
 * Los dos segundos que tarda en saberse si hay sesión.
 *
 * Con la forma de la pantalla que va a venir, no con un spinner centrado: el
 * salto de un spinner a una lista se nota más que el de un esqueleto a la lista.
 */
function Esperando() {
  return (
    <div className="container max-w-3xl space-y-4 py-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
