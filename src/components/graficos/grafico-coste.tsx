'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { eurosPrecisos, fecha } from '@/lib/format'

export type PuntoCoste = {
  fechaISO: string
  coste: number
  esReal: boolean
}

/**
 * Evolución del coste por ración de una elaboración (MISE-009).
 *
 * Una sola serie, así que no lleva leyenda: el título de la tarjeta ya dice qué
 * se está mirando. Lo que sí lleva es un marcador distinto según la procedencia
 * del dato — relleno si el coste sale de precios reales de recepción, hueco si
 * todavía viene del Excel. Es forma, no color: quien no distingue matices sigue
 * viendo la diferencia entre un dato firme y una estimación.
 */
export function GraficoCoste({ puntos }: { puntos: PuntoCoste[] }) {
  if (puntos.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Hace falta más de un cálculo de coste para dibujar una evolución. El segundo
        llegará con la próxima recepción que toque uno de sus ingredientes.
      </p>
    )
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={puntos} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          {/* Rejilla discreta: es referencia, no contenido. */}
          <CartesianGrid
            stroke="hsl(var(--chart-grid))"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="fechaISO"
            tickFormatter={(v: string) => fecha(v)}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={{ stroke: 'hsl(var(--chart-grid))' }}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v: number) => eurosPrecisos(v)}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          <Tooltip
            cursor={{ stroke: 'hsl(var(--chart-grid))', strokeWidth: 1 }}
            contentStyle={{
              background: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
              fontSize: 12,
              color: 'hsl(var(--popover-foreground))',
            }}
            labelFormatter={(v: string) => fecha(v)}
            formatter={(valor: number, _nombre, item) => [
              `${eurosPrecisos(valor)} ${item?.payload?.esReal ? '(real)' : '(estimado)'}`,
              'Coste por ración',
            ]}
          />
          <Line
            type="monotone"
            dataKey="coste"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={(props) => {
              const { cx, cy, payload, index } = props as {
                cx: number
                cy: number
                index: number
                payload: PuntoCoste
              }
              return (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={4}
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill={payload.esReal ? 'var(--chart-1)' : 'var(--chart-surface)'}
                />
              )
            }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--chart-surface)' }}
          />
        </LineChart>
      </ResponsiveContainer>

      <p className="pt-2 text-center text-xs text-muted-foreground">
        Punto relleno: coste con precios reales de recepción. Punto hueco: todavía con
        precios estimados.
      </p>
    </div>
  )
}
