'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { euros } from '@/lib/format'

export type PuntoGasto = {
  /** Etiqueta ya formateada: "ago 2026". */
  periodo: string
  importe: number
}

/**
 * Gasto mensual (MISE-007).
 *
 * Una sola serie con el total: la pregunta que abre el panel es "¿cuánto me
 * estoy gastando?", y para eso una barra apilada por proveedor estorba más que
 * ayuda. El desglose por proveedor, local y categoría va debajo en tablas, que
 * además son exportables y se leen sin interpretar colores.
 */
export function GraficoGasto({ datos }: { datos: PuntoGasto[] }) {
  if (datos.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay recepciones registradas en este rango.
      </p>
    )
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid
            stroke="hsl(var(--chart-grid))"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="periodo"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={{ stroke: 'hsl(var(--chart-grid))' }}
          />
          <YAxis
            tickFormatter={(v: number) => euros(v)}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            width={80}
          />
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
            contentStyle={{
              background: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
              fontSize: 12,
              color: 'hsl(var(--popover-foreground))',
            }}
            formatter={(valor: number) => [euros(valor), 'Gasto recibido']}
          />
          {/* Extremo redondeado solo arriba: la barra sigue anclada a la línea
              de cero, que es lo que hace comparable su longitud. */}
          <Bar dataKey="importe" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={56} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
