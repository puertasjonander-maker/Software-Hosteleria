import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = { title: 'Administración' }
export const dynamic = 'force-dynamic'

async function contar(tabla: 'locations' | 'suppliers' | 'products' | 'profiles') {
  const supabase = createClient()
  const { count } = await supabase.from(tabla).select('id', { count: 'exact', head: true })
  return count ?? 0
}

export default async function PaginaAdmin() {
  const supabase = createClient()

  const [locales, proveedores, productos, usuarios] = await Promise.all([
    contar('locations'),
    contar('suppliers'),
    contar('products'),
    contar('profiles'),
  ])

  const [asignaciones, pautas, sinLocal] = await Promise.all([
    supabase.from('location_products').select('product_id', { count: 'exact', head: true }),
    supabase.from('supplier_schedules').select('id', { count: 'exact', head: true }),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .neq('role', 'operador')
      .is('location_id', null),
  ])

  const tarjetas = [
    { etiqueta: 'Locales', valor: locales, href: '/admin/locales' },
    { etiqueta: 'Proveedores', valor: proveedores, href: '/admin/proveedores' },
    { etiqueta: 'Productos', valor: productos, href: '/admin/productos' },
    { etiqueta: 'Usuarios', valor: usuarios, href: '/admin/usuarios' },
  ]

  /*
   * Cada aviso corresponde a un fallo concreto que se nota en producción:
   * sin catálogo `/pedir` está vacío, sin asignaciones también, sin pauta no
   * hay avisos de corte, y un barista sin local no puede registrar nada.
   */
  const avisos = [
    productos === 0 && {
      texto: 'No hay productos en el catálogo. La pantalla de pedir está vacía para todos.',
      accion: { href: '/admin/importar', etiqueta: 'Importar catálogo' },
    },
    productos > 0 &&
      (asignaciones.count ?? 0) === 0 && {
        texto:
          'Hay productos pero ninguno está asignado a un local. Nadie los verá al pedir.',
        accion: { href: '/admin/productos', etiqueta: 'Asignar a locales' },
      },
    proveedores > 0 &&
      (pautas.count ?? 0) === 0 && {
        texto:
          'Ningún proveedor tiene pauta de pedido. Sin ella no hay hora de corte ni avisos.',
        accion: { href: '/admin/proveedores', etiqueta: 'Definir pautas' },
      },
    (sinLocal.count ?? 0) > 0 && {
      texto: `${sinLocal.count} usuarios sin local asignado. No pueden pedir ni recepcionar.`,
      accion: { href: '/admin/usuarios', etiqueta: 'Asignar local' },
    },
  ].filter(Boolean) as { texto: string; accion: { href: string; etiqueta: string } }[]

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tarjetas.map((t) => (
          <Link key={t.href} href={t.href}>
            <Card className="h-full transition-colors duration-rapido ease-estandar hover:bg-accent/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t.etiqueta}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="cifra-dato text-[1.75rem] leading-8">{t.valor}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Qué falta para que esto funcione</CardTitle>
        </CardHeader>
        <CardContent>
          {avisos.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-ok">
              <CheckCircle2 className="h-4 w-4" />
              Todo listo: catálogo cargado, asignado a locales, con pautas y usuarios con
              local.
            </p>
          ) : (
            <ul className="space-y-2">
              {avisos.map((a) => (
                <li
                  key={a.texto}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn"
                >
                  <span className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {a.texto}
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link href={a.accion.href}>
                      {a.accion.etiqueta} <ArrowRight />
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
