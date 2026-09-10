import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarClock, CalendarX2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { exigirRol } from '@/lib/auth'
import {
  comoMaquinaFila,
  ordenarPorUrgencia,
  peorSemaforo,
  resumirParque,
  textoRevision,
  type MaquinaFila,
} from '@/lib/parque'
import { fecha as formatearFecha, plural } from '@/lib/format'
import { hoyEnMadrid } from '@/lib/time'
import { EstadoVacio } from '@/components/ui/states'
import { ChipSemaforo, PuntoSemaforo } from '@/components/chip-semaforo'
import { ResumenParque } from '@/components/resumen-parque'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Panel' }
export const dynamic = 'force-dynamic'

/** Los tres periodos que se miran de verdad: el mes, el trimestre y el año. */
const PERIODOS = [
  { dias: 30, etiqueta: '30 días' },
  { dias: 90, etiqueta: '90 días' },
  { dias: 365, etiqueta: '1 año' },
]

const DIAS_POR_DEFECTO = 90

/** Resta días a una fecha `aaaa-mm-dd` sin arrastrar zonas horarias. */
function restarDias(fechaISO: string, dias: number): string {
  const d = new Date(`${fechaISO}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

/**
 * El panel (EBX-304).
 *
 * Contesta a tres preguntas en este orden: qué está roto ahora mismo, a qué box
 * hay que ir esta semana, y cuánto se ha trabajado. Las tres se leen del mismo
 * parque, así que se carga una vez y se agrupa aquí en vez de pedir tres
 * consultas agregadas.
 */
export default async function PaginaPanel({
  searchParams,
}: {
  searchParams: { dias?: string }
}) {
  await exigirRol('admin')
  const supabase = createClient()

  const dias = PERIODOS.some((p) => String(p.dias) === searchParams.dias)
    ? Number(searchParams.dias)
    : DIAS_POR_DEFECTO

  const hasta = hoyEnMadrid()
  const desde = restarDias(hasta, dias)

  const [{ data: clientes }, { data: parque }, { data: servicios }] = await Promise.all([
    supabase.from('clientes').select('id, nombre, poblacion, activo').order('nombre'),
    supabase.from('parque_estado').select('*'),
    supabase.from('servicios').select('id, cliente_id, fecha, estado').gte('fecha', desde).lte('fecha', hasta),
  ])

  const maquinas: MaquinaFila[] = (parque ?? []).map(comoMaquinaFila)
  const nombreBox = new Map((clientes ?? []).map((c) => [c.id, c.nombre]))
  const clienteDeMaquina = new Map((parque ?? []).map((m) => [m.id, m.cliente_id]))

  const resumen = resumirParque(maquinas)

  const porBox = (clientes ?? []).map((c) => {
    const suyas = maquinas.filter((m) => clienteDeMaquina.get(m.id) === c.id)
    const activas = suyas.filter((m) => m.activa)
    return {
      id: c.id,
      nombre: c.nombre,
      poblacion: c.poblacion,
      activo: c.activo,
      resumen: resumirParque(suyas),
      peor: peorSemaforo(activas.map((m) => m.estado)),
      servicios: (servicios ?? []).filter((s) => s.cliente_id === c.id && s.estado === 'hecho').length,
    }
  })

  /*
   * Un box en rojo por delante de uno en verde, y el que no tiene parque al
   * final: mientras no tenga máquinas no hay nada que decidir sobre él.
   */
  porBox.sort((a, b) => {
    const vacioA = a.resumen.total === 0
    const vacioB = b.resumen.total === 0
    if (vacioA !== vacioB) return vacioA ? 1 : -1

    const urgenciaA = a.resumen.porEstado.rojo * 100 + a.resumen.vencidas
    const urgenciaB = b.resumen.porEstado.rojo * 100 + b.resumen.vencidas
    if (urgenciaA !== urgenciaB) return urgenciaB - urgenciaA

    return a.nombre.localeCompare(b.nombre, 'es')
  })

  const pendientes = ordenarPorUrgencia(
    maquinas.filter((m) => m.activa && m.diasHastaRevision !== null && m.diasHastaRevision <= 30),
  )

  const hechos = (servicios ?? []).filter((s) => s.estado === 'hecho').length
  const abiertos = (servicios ?? []).filter(
    (s) => s.estado === 'planificado' || s.estado === 'en_curso',
  ).length

  return (
    <div className="container max-w-5xl space-y-5 py-4 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="titulo-pantalla">Panel</h1>

        <nav className="flex gap-1 rounded-lg border bg-card p-1">
          {PERIODOS.map((p) => (
            <Link
              key={p.dias}
              href={`/panel?dias=${p.dias}`}
              aria-current={p.dias === dias ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5 text-meta font-medium transition-colors duration-rapido ease-estandar',
                p.dias === dias
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {p.etiqueta}
            </Link>
          ))}
        </nav>
      </header>

      {maquinas.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay parque que mirar"
          descripcion="En cuanto un box tenga máquinas dadas de alta, aquí aparece su estado y lo que le toca."
        />
      ) : (
        <>
          <ResumenParque resumen={resumen} />

          <section className="grid gap-3 sm:grid-cols-3">
            <Cifra valor={hechos} etiqueta={`visitas terminadas en ${dias} días`} />
            <Cifra valor={abiertos} etiqueta="visitas abiertas en ese periodo" />
            <Cifra
              valor={porBox.filter((b) => b.resumen.total > 0).length}
              etiqueta="boxes con parque"
            />
          </section>

          <section className="space-y-3">
            <h2 className="titulo-seccion">Revisiones vencidas y próximas</h2>

            {pendientes.length === 0 ? (
              <EstadoVacio
                titulo="Nada vence en los próximos 30 días"
                descripcion="Todo el parque con cadencia contratada está dentro de plazo."
              />
            ) : (
              <ul className="divide-y rounded-lg border bg-card">
                {pendientes.slice(0, 20).map((m) => {
                  const revision = textoRevision(m)
                  const clienteId = clienteDeMaquina.get(m.id)
                  const vencida = (m.diasHastaRevision ?? 0) < 0

                  return (
                    <li key={m.id}>
                      <Link
                        href={`/clientes/${clienteId}/maquinas/${m.id}`}
                        className="flex items-center gap-3 px-3 py-3 transition-colors duration-rapido ease-estandar hover:bg-accent"
                      >
                        {vencida ? (
                          <CalendarX2 className="h-4 w-4 shrink-0 text-destructive" />
                        ) : (
                          <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}

                        <div className="min-w-0 flex-1">
                          <span className="titulo-tarjeta">{m.nombre}</span>
                          <p className="truncate texto-meta">
                            {clienteId ? nombreBox.get(clienteId) ?? 'Box' : 'Box'}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <p
                            className={
                              revision?.urgente
                                ? 'texto-micro text-destructive'
                                : 'texto-micro text-muted-foreground'
                            }
                          >
                            {revision?.texto}
                          </p>
                          <p className="texto-micro text-muted-foreground">
                            {formatearFecha(m.proximaRevision)}
                          </p>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}

            {pendientes.length > 20 ? (
              <p className="texto-meta">
                Y {pendientes.length - 20} más. Se ven completas en la pantalla de cada box.
              </p>
            ) : null}
          </section>

          <section className="space-y-3">
            <h2 className="titulo-seccion">Parque por box</h2>

            <ul className="divide-y rounded-lg border bg-card">
              {porBox.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/clientes/${b.id}`}
                    className="flex items-center gap-3 px-3 py-3 transition-colors duration-rapido ease-estandar hover:bg-accent"
                  >
                    {b.peor ? (
                      <PuntoSemaforo estado={b.peor} />
                    ) : (
                      <span className="h-2.5 w-2.5 shrink-0" />
                    )}

                    <div className="min-w-0 flex-1">
                      <span className={b.activo ? 'titulo-tarjeta' : 'titulo-tarjeta opacity-60'}>
                        {b.nombre}
                      </span>
                      <p className="truncate texto-meta">
                        {[
                          b.poblacion,
                          b.resumen.total > 0
                            ? plural(b.resumen.total, 'máquina', 'máquinas')
                            : 'sin parque',
                          b.resumen.vencidas > 0
                            ? plural(b.resumen.vencidas, 'vencida', 'vencidas')
                            : null,
                          !b.activo ? 'inactivo' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      {b.peor ? <ChipSemaforo estado={b.peor} /> : null}
                      <p className="mt-0.5 texto-micro text-muted-foreground">
                        {plural(b.servicios, 'visita', 'visitas')}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}

function Cifra({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <p className="text-2xl font-semibold tabular-nums">{valor}</p>
      <p className="texto-meta">{etiqueta}</p>
    </div>
  )
}
