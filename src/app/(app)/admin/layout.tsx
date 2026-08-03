import Link from 'next/link'
import { exigirRol } from '@/lib/auth'

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
    <div className="container max-w-6xl space-y-5 py-4">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Administración</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo, proveedores, locales y usuarios. Sin esto, el resto del sistema no
            tiene sobre qué operar.
          </p>
        </div>

        <nav className="flex flex-wrap gap-1 border-b">
          {SECCIONES.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-t-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {s.etiqueta}
            </Link>
          ))}
        </nav>
      </header>

      {children}
    </div>
  )
}
