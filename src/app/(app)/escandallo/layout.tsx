import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { exigirRol } from '@/lib/auth'
import { porcentaje } from '@/lib/format'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const PESTANAS = [
  { href: '/escandallo', etiqueta: 'Elaboraciones' },
  { href: '/escandallo/mapeo', etiqueta: 'Mapeo' },
  { href: '/escandallo/simulador', etiqueta: 'Simulador' },
  { href: '/escandallo/importar', etiqueta: 'Importar' },
]

/**
 * Indicador de cobertura persistente (MISE-008, criterio visual): en cualquier
 * pantalla del escandallo se ve qué porcentaje de la carta tiene todos sus
 * ingredientes mapeados. Es el número que decide si el módulo de coste sirve
 * para algo, así que no se esconde en un informe.
 */
export default async function LayoutEscandallo({
  children,
}: {
  children: React.ReactNode
}) {
  await exigirRol('encargado', 'operador')
  const supabase = createClient()

  const { data: cobertura } = await supabase
    .from('recipe_current_cost')
    .select('recipe_id, has_gaps, active')

  const activas = (cobertura ?? []).filter((r) => r.active)
  const completas = activas.filter((r) => !r.has_gaps).length
  const pct = activas.length === 0 ? 0 : (100 * completas) / activas.length

  return (
    <div className="container max-w-5xl space-y-5 py-4">
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Escandallo</h1>
            <p className="text-sm text-muted-foreground">
              Coste y margen por elaboración, recalculados con cada recepción.
            </p>
          </div>

          <div className="min-w-[14rem] space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Carta con escandallo completo</span>
              <span className="font-semibold tabular-nums">{porcentaje(pct, 0)}</span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={Math.round(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Porcentaje de elaboraciones con todos sus ingredientes mapeados"
            >
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  pct >= 80 ? 'bg-ok' : pct >= 40 ? 'bg-warn' : 'bg-destructive',
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {completas} de {activas.length} elaboraciones
            </p>
          </div>
        </div>

        <nav className="flex flex-wrap gap-1 border-b">
          {PESTANAS.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="rounded-t-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {p.etiqueta}
            </Link>
          ))}
        </nav>
      </header>

      {children}
    </div>
  )
}
