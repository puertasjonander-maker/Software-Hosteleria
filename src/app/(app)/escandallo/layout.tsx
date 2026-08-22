import { createClient } from '@/lib/supabase/server'
import { exigirRol } from '@/lib/auth'
import { porcentaje } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PestanasSeccion } from '@/components/pestanas-seccion'

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
    <div className="container max-w-5xl space-y-5 py-3 md:py-4">
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="hidden md:block">
            <h1 className="titulo-pantalla">Escandallo</h1>
            <p className="mt-1 texto-meta">
              Coste y margen por elaboración, recalculados con cada recepción.
            </p>
          </div>

          <div className="min-w-[14rem] space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-meta text-muted-foreground">Carta con escandallo completo</span>
              <span className="text-cuerpo font-semibold tabular-nums">{porcentaje(pct, 0)}</span>
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
                  'h-full rounded-full transition-[width,background-color] duration-base ease-salida',
                  pct >= 80 ? 'bg-ok' : pct >= 40 ? 'bg-warn' : 'bg-destructive',
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-micro font-medium text-muted-foreground">
              {completas} de {activas.length} elaboraciones
            </p>
          </div>
        </div>

        <PestanasSeccion pestanas={PESTANAS} />
      </header>

      {children}
    </div>
  )
}
