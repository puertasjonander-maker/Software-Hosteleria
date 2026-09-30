import { Wallet } from 'lucide-react'
import { ETIQUETA_TIPO_MAQUINA } from '@/lib/roles'
import { euros } from '@/lib/format'
import type { ValorParque } from '@/lib/valor'
import { cn } from '@/lib/utils'

/**
 * El valor estimado de un parque (EBX-505).
 *
 * Un número grande —lo que cuesta reponer el parque entero a día de hoy— y
 * debajo el desglose por tipo, del tipo que más vale al que menos. Es un
 * orientativo de reposición (precios nuevos, benchmark de mercado), y eso se
 * dice en el pie en vez de venderse como una cifra exacta.
 */
export function ValorParque({
  valor,
  className,
}: {
  valor: ValorParque
  className?: string
}) {
  if (valor.total === 0) return null

  return (
    <div
      className={cn(
        'rounded-lg border bg-card px-3 py-2.5',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5 titulo-tarjeta">
          <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" />
          Valor estimado del parque
        </span>
        <span className="text-2xl font-semibold tabular-nums">{euros(valor.total)}</span>
      </div>

      <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {valor.lineas.map((linea) => (
          <div key={linea.tipo} className="flex items-baseline justify-between gap-2">
            <dt className="truncate texto-meta">
              {ETIQUETA_TIPO_MAQUINA[linea.tipo]}
              <span className="text-muted-foreground">
                {' '}
                ×{linea.cantidad} · {euros(linea.unitario)}/u
              </span>
            </dt>
            <dd className="shrink-0 text-cuerpo font-semibold tabular-nums">
              {euros(linea.subtotal)}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-2 border-t pt-2 texto-micro text-muted-foreground">
        Precio orientativo de reposición a nuevo, benchmark de mercado (sept 2026).
        {valor.sinReferencia > 0
          ? ` ${valor.sinReferencia} ${valor.sinReferencia === 1 ? 'máquina sin' : 'máquinas sin'} valor de referencia (tipo «otro»).`
          : null}
      </p>
    </div>
  )
}
