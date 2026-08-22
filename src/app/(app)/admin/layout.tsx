import { exigirRol } from '@/lib/auth'
import { PestanasSeccion } from '@/components/pestanas-seccion'

export const dynamic = 'force-dynamic'

const SECCIONES = [
  { href: '/admin', etiqueta: 'Resumen' },
  { href: '/admin/importar', etiqueta: 'Importar catálogo' },
  { href: '/admin/proveedores', etiqueta: 'Proveedores' },
  { href: '/admin/productos', etiqueta: 'Productos' },
  { href: '/admin/locales', etiqueta: 'Locales' },
  { href: '/admin/usuarios', etiqueta: 'Usuarios' },
  { href: '/admin/ajustes', etiqueta: 'Ajustes' },
]

export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  await exigirRol('operador')

  return (
    <div className="container max-w-6xl space-y-5 py-3 md:py-4">
      <header className="space-y-3">
        <div className="hidden md:block">
          <h1 className="titulo-pantalla">Administración</h1>
          <p className="mt-1 texto-meta">
            Catálogo, proveedores, locales y usuarios. Sin esto, el resto del sistema no
            tiene sobre qué operar.
          </p>
        </div>

        <PestanasSeccion pestanas={SECCIONES} />
      </header>

      {children}
    </div>
  )
}
