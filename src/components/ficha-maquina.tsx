import type { MaquinaFila } from '@/lib/parque'
import { textoRevision } from '@/lib/parque'
import { ETIQUETA_TIPO_MAQUINA } from '@/lib/roles'
import { fecha as formatearFecha, plural } from '@/lib/format'
import { ChipSemaforo } from '@/components/chip-semaforo'
import { IconoMaquina } from '@/components/icono-maquina'

/**
 * La cabecera de una ficha de máquina: quién es y cuándo le toca.
 *
 * La misma para el técnico y para el dueño del box. Lo que no se enseña aquí no
 * es que el cliente no pueda verlo — la RLS ya le deja leer estas columnas — sino
 * que no hay nada en la ficha que valga la pena esconderle.
 */
export function CabeceraMaquina({ maquina }: { maquina: MaquinaFila }) {
  const revision = textoRevision(maquina)

  const identidad = [
    ETIQUETA_TIPO_MAQUINA[maquina.tipo],
    [maquina.marca, maquina.modelo].filter(Boolean).join(' ') || null,
    maquina.numSerie ? `nº ${maquina.numSerie}` : null,
    maquina.ubicacion,
  ].filter(Boolean)

  return (
    <header className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <IconoMaquina tipo={maquina.tipo} className="size-5 text-muted-foreground" />
        <h1 className="titulo-pantalla">{maquina.nombre}</h1>
        <ChipSemaforo estado={maquina.estado} />
        {!maquina.activa ? (
          <span className="rounded-full border px-2.5 py-0.5 text-micro font-semibold text-muted-foreground">
            Fuera del parque
          </span>
        ) : null}
      </div>

      <p className="texto-meta">{identidad.join(' · ')}</p>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border bg-card px-3 py-2.5 sm:grid-cols-4">
        <Dato titulo="Última revisión" valor={formatearFecha(maquina.ultimaRevision)} />
        <Dato
          titulo="Próxima"
          valor={maquina.proximaRevision ? formatearFecha(maquina.proximaRevision) : '—'}
          pie={revision?.texto}
          avisa={revision?.avisa}
        />
        <Dato
          titulo="Cadencia"
          valor={
            maquina.cadenciaMeses
              ? plural(maquina.cadenciaMeses, 'mes', 'meses')
              : 'sin recurrencia'
          }
        />
        <Dato titulo="Servicios" valor={String(maquina.serviciosHechos)} />
      </dl>

      {maquina.notas ? <p className="whitespace-pre-line texto-meta">{maquina.notas}</p> : null}
    </header>
  )
}

function Dato({
  titulo,
  valor,
  pie,
  avisa,
}: {
  titulo: string
  valor: string
  pie?: string
  avisa?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="texto-micro uppercase tracking-wide text-muted-foreground">{titulo}</dt>
      <dd className="truncate text-cuerpo font-semibold">{valor}</dd>
      {pie ? (
        <dd className={avisa ? 'texto-micro text-destructive' : 'texto-micro text-muted-foreground'}>
          {pie}
        </dd>
      ) : null}
    </div>
  )
}
