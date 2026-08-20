import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, Clock, PackageCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { exigirSesion } from '@/lib/auth'
import { esGestor, ETIQUETA_ESTADO_PEDIDO } from '@/lib/roles'
import { calcularCorte, type Corte, type EstadoCorte } from '@/lib/cutoff'
import { duracionRelativa } from '@/lib/time'
import { euros, fecha, plural } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EstadoError, EstadoVacio } from '@/components/ui/states'
import { cn } from '@/lib/utils'
import { ActivarAvisos } from '@/components/pwa/activar-avisos'
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
      <span className="inline-flex min-w-0 items-center gap-1.5 text-meta text-muted-foreground">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Sin pauta de pedido</span>
      </span>
    )
  }

  if (corte.estado === 'vencido') {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-meta font-medium text-destructive">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          Corte vencido {duracionRelativa(corte.minutosHasta ?? 0)}
        </span>
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 text-meta',
        corte.estado === 'proximo' ? 'font-medium text-warn' : 'text-muted-foreground',
      )}
    >
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        Corte {corte.etiqueta} · {duracionRelativa(corte.minutosHasta ?? 0)}
      </span>
    </span>
  )
}

/**
 * El canto de la tarjeta lleva la urgencia. Es lo que permite bajar la bandeja
 * sin leerla: rojo es que ya se ha pasado, ámbar es que queda poco.
 */
const RAIL_CORTE: Record<EstadoCorte, string> = {
  vencido: 'border-l-destructive',
  proximo: 'border-l-warn',
  holgado: 'border-l-border',
  sin_pauta: 'border-l-border',
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
    <div className="container max-w-3xl space-y-6 py-3 md:py-4">
      <header className="hidden md:block">
        <h1 className="titulo-pantalla">Pedidos</h1>
        <p className="mt-1 texto-meta">
          Lo que han pedido los tres locales, agrupado por proveedor.
        </p>
      </header>

      <section className="space-y-2.5">
        <h2 className="titulo-seccion">Pendiente de pedir</h2>

        {bandeja.length === 0 ? (
          <EstadoVacio
            titulo="No hay nada pendiente"
            descripcion="Cuando alguien registre una falta desde Pedir, aparecerá aquí agrupada por proveedor."
            icono={PackageCheck}
          />
        ) : (
          <ul className="space-y-2.5">
            {bandeja.map((fila, indice) => (
              <li
                key={fila.supplier_id}
                className="animate-entrada-fila"
                style={{ animationDelay: `${Math.min(indice, 7) * 24}ms` }}
              >
                {/*
                 * Orden de lectura: qué → cuándo → cuánto → hacer. Antes lo
                 * primero que se leía era el botón, que estaba arriba a la
                 * derecha, a la misma altura óptica que el nombre del proveedor.
                 */}
                <Card className={cn('border-l-[3px] p-3.5', RAIL_CORTE[fila.corte.estado])}>
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="min-w-0 truncate">{fila.supplier_name}</CardTitle>
                    {/* El importe en su propio escalón: es el número con el que
                        se decide, y hasta ahora medía lo mismo que un contador. */}
                    <span className="cifra-dato shrink-0 leading-[22px]">
                      {euros(Number(fila.estimated_amount ?? 0))}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center justify-between gap-3">
                    <EtiquetaCorte corte={fila.corte} />
                    {/* Nunca un importe sin decir de dónde sale (regla 7). */}
                    <Badge variant="estimado" className="shrink-0">
                      estimado
                    </Badge>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-micro text-muted-foreground">
                      {plural(Number(fila.line_count), 'producto', 'productos')} ·{' '}
                      {plural(Number(fila.request_count), 'solicitud', 'solicitudes')}
                      {fila.has_products_without_price ? ' · hay productos sin precio' : ''}
                    </span>

                    {gestor ? <BotonPreparar supplierId={fila.supplier_id} /> : null}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="titulo-seccion">En curso</h2>

        {enCurso.length === 0 ? (
          <EstadoVacio
            titulo="Ningún pedido en curso"
            descripcion="Los pedidos enviados y a medio recibir se quedan aquí hasta que se cierran."
          />
        ) : (
          <ul className="space-y-1.5">
            {enCurso.map((pedido) => (
              <li key={pedido.id}>
                <Link
                  href={`/pedidos/${pedido.id}`}
                  className="flex items-center gap-3 rounded-lg border border-l-[3px] border-l-transparent p-2.5 pl-3 transition-colors duration-rapido ease-estandar hover:bg-accent/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-cuerpo font-semibold leading-5">
                      {nombreProveedor.get(pedido.supplier_id) ?? 'Proveedor'}
                    </p>
                    <p className="mt-0.5 truncate text-meta text-muted-foreground">
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
                      'shrink-0 rounded-full px-2.5 py-0.5 text-micro font-semibold',
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

      <div className="flex justify-center pt-1">
        <ActivarAvisos />
      </div>
    </div>
  )
}
