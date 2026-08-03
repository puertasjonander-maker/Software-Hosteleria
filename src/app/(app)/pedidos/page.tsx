import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, Clock, PackageCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { exigirSesion } from '@/lib/auth'
import { esGestor, ETIQUETA_ESTADO_PEDIDO } from '@/lib/roles'
import { calcularCorte, type Corte } from '@/lib/cutoff'
import { duracionRelativa } from '@/lib/time'
import { euros, fecha, plural } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EstadoError, EstadoVacio } from '@/components/ui/states'
import { cn } from '@/lib/utils'
import { BotonPreparar } from './boton-preparar'

export const metadata: Metadata = { title: 'Pedidos' }
export const dynamic = 'force-dynamic'

const ESTILO_ESTADO: Record<string, string> = {
  borrador: 'bg-muted text-muted-foreground',
  enviado: 'bg-primary/10 text-primary',
  recibido_parcial: 'bg-warn/15 text-warn',
  cerrado: 'bg-ok/15 text-ok',
}

function EtiquetaCorte({ corte }: { corte: Corte }) {
  if (corte.estado === 'sin_pauta') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" /> Sin pauta de pedido
      </span>
    )
  }

  if (corte.estado === 'vencido') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
        <AlertTriangle className="h-3.5 w-3.5" />
        Corte de hoy vencido {duracionRelativa(corte.minutosHasta ?? 0)}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        corte.estado === 'proximo' ? 'font-medium text-warn' : 'text-muted-foreground',
      )}
    >
      <Clock className="h-3.5 w-3.5" />
      Corte {corte.etiqueta} · {duracionRelativa(corte.minutosHasta ?? 0)}
    </span>
  )
}

export default async function PaginaPedidos() {
  const sesion = await exigirSesion()
  const supabase = createClient()
  const gestor = esGestor(sesion.profile.role)

  const [pendientes, pautas, pedidos, proveedores] = await Promise.all([
    supabase.from('pending_by_supplier').select('*'),
    supabase.from('supplier_schedules').select('*'),
    supabase
      .from('orders')
      .select('*')
      .in('status', ['borrador', 'enviado', 'recibido_parcial'])
      .order('created_at', { ascending: false }),
    supabase.from('suppliers').select('*'),
  ])

  if (pendientes.error && pedidos.error) {
    return (
      <div className="container max-w-3xl py-6">
        <EstadoError descripcion="No hemos podido cargar la bandeja de pedidos." />
      </div>
    )
  }

  const pautasPorProveedor = new Map<string, typeof pautas.data>()
  for (const pauta of pautas.data ?? []) {
    const lista = pautasPorProveedor.get(pauta.supplier_id) ?? []
    lista.push(pauta)
    pautasPorProveedor.set(pauta.supplier_id, lista)
  }

  const nombreProveedor = new Map((proveedores.data ?? []).map((s) => [s.id, s.name]))

  // Lo vencido primero, luego lo que está a punto de vencer: la bandeja se
  // ordena por urgencia real, no por orden alfabético (MISE-002).
  const bandeja = (pendientes.data ?? [])
    .map((fila) => ({
      ...fila,
      corte: calcularCorte(pautasPorProveedor.get(fila.supplier_id) ?? []),
    }))
    .sort((a, b) => {
      const peso = (e: string) => (e === 'vencido' ? 0 : e === 'proximo' ? 1 : 2)
      const dif = peso(a.corte.estado) - peso(b.corte.estado)
      if (dif !== 0) return dif
      return (a.corte.minutosHasta ?? 1e9) - (b.corte.minutosHasta ?? 1e9)
    })

  const enCurso = pedidos.data ?? []

  return (
    <div className="container max-w-3xl space-y-8 py-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
        <p className="text-sm text-muted-foreground">
          Lo que han pedido los tres locales, agrupado por proveedor.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Pendiente de pedir
        </h2>

        {bandeja.length === 0 ? (
          <EstadoVacio
            titulo="No hay nada pendiente"
            descripcion="Cuando alguien registre una falta desde Pedir, aparecerá aquí agrupada por proveedor."
            icono={PackageCheck}
          />
        ) : (
          <ul className="space-y-3">
            {bandeja.map((fila) => (
              <li key={fila.supplier_id}>
                <Card
                  className={cn(
                    fila.corte.estado === 'vencido' && 'border-destructive/50',
                    fila.corte.estado === 'proximo' && 'border-warn/50',
                  )}
                >
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <CardTitle className="text-base">{fila.supplier_name}</CardTitle>
                        <EtiquetaCorte corte={fila.corte} />
                      </div>

                      {gestor ? <BotonPreparar supplierId={fila.supplier_id} /> : null}
                    </div>
                  </CardHeader>

                  <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-0 text-sm">
                    <span>{plural(Number(fila.line_count), 'producto', 'productos')}</span>
                    <span className="text-muted-foreground">
                      {plural(Number(fila.request_count), 'solicitud', 'solicitudes')}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {euros(Number(fila.estimated_amount ?? 0))}
                      {/* Nunca un importe sin decir de dónde sale (regla 7). */}
                      <Badge variant="estimado">estimado</Badge>
                    </span>
                    {fila.has_products_without_price ? (
                      <span className="text-xs text-muted-foreground">
                        (hay productos sin precio conocido)
                      </span>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Pedidos en curso
        </h2>

        {enCurso.length === 0 ? (
          <EstadoVacio
            titulo="Ningún pedido en curso"
            descripcion="Los pedidos enviados y a medio recibir se quedan aquí hasta que se cierran."
          />
        ) : (
          <ul className="space-y-2">
            {enCurso.map((pedido) => (
              <li key={pedido.id}>
                <Link
                  href={`/pedidos/${pedido.id}`}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {nombreProveedor.get(pedido.supplier_id) ?? 'Proveedor'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pedido.sent_at
                        ? `Enviado el ${fecha(pedido.sent_at)}`
                        : `Borrador del ${fecha(pedido.created_at)}`}
                      {pedido.expected_delivery
                        ? ` · entrega ${fecha(pedido.expected_delivery)}`
                        : ''}
                    </p>
                  </div>

                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-xs font-medium',
                      ESTILO_ESTADO[pedido.status],
                    )}
                  >
                    {ETIQUETA_ESTADO_PEDIDO[pedido.status]}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
