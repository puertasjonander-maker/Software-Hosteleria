'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CloudOff, RefreshCw, Upload } from 'lucide-react'
import { toast } from 'sonner'
import type { EstadoServicio, Semaforo, TipoMaquina } from '@/lib/database.types'
import { ETIQUETA_ESTADO_SERVICIO, ETIQUETA_TIPO_MAQUINA } from '@/lib/roles'
import { fecha as formatearFecha, plural } from '@/lib/format'
import { tamano } from '@/lib/foto'
import { contarPendientes, sincronizar, type Pendientes } from '@/lib/cola-visita'
import { Button } from '@/components/ui/button'
import { PuntoSemaforo } from '@/components/chip-semaforo'
import { ParteMaquina } from './parte-maquina'

export type ParteTrabajo = {
  id: string
  maquinaId: string
  nombre: string
  tipo: TipoMaquina
  marca: string | null
  numSerie: string | null
  ubicacion: string | null
  estadoMaquina: Semaforo
  trabajoHecho: string | null
  piezas: string | null
  estadoAntes: Semaforo | null
  estadoDespues: Semaforo | null
  damper: number | null
  dragFactor: number | null
  minutos: number | null
  hecho: boolean
}

/**
 * Pantalla de trabajo de una visita (EBX-202).
 *
 * Es la pantalla que decide el proyecto. Se usa de pie, agachado, con guantes y
 * sin cobertura, y compite contra hacer la foto con la cámara del móvil y
 * apuntarlo en un papel. El presupuesto es de sesenta segundos por máquina.
 *
 * De ahí salen tres decisiones: la lista no se pagina ni se filtra (doce filas
 * caben), lo que queda por hacer está siempre arriba, y el contador de lo que
 * falta por subir se ve sin buscarlo.
 */
export function Trabajo({
  servicioId,
  clienteId,
  clienteNombre,
  fecha,
  estado,
  notas,
  partes,
}: {
  servicioId: string
  clienteId: string
  clienteNombre: string
  fecha: string
  estado: EstadoServicio
  notas: string | null
  partes: ParteTrabajo[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState<ParteTrabajo | null>(null)

  /*
   * Lo cerrado en local, encima de lo que dijo el servidor.
   *
   * Sin esto, cerrar un parte sin cobertura no cambiaría nada en pantalla: la
   * escritura fue a IndexedDB y `router.refresh()` no puede ir a buscar nada. El
   * técnico volvería a abrir la misma máquina sin saber que ya la había hecho.
   */
  const [cerradosEnLocal, setCerradosEnLocal] = useState<Set<string>>(new Set())

  const [pendientes, setPendientes] = useState<Pendientes>({ partes: 0, fotos: 0, bytes: 0 })
  const [enLinea, setEnLinea] = useState(true)
  const [subiendo, setSubiendo] = useState(false)

  const refrescarPendientes = useCallback(async () => {
    setPendientes(await contarPendientes())
  }, [])

  const vaciarCola = useCallback(
    async (silencioso: boolean) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await refrescarPendientes()
        return
      }
      setSubiendo(true)
      const r = await sincronizar()
      setPendientes(r.pendientes)
      setSubiendo(false)

      if (r.subidas > 0) {
        if (!silencioso) toast.success('Todo subido')
        router.refresh()
      } else if (r.fallos > 0 && !silencioso) {
        toast.error('No hemos podido subirlo todo', { description: 'Se reintentará solo.' })
      }
    },
    [refrescarPendientes, router],
  )

  useEffect(() => {
    setEnLinea(navigator.onLine)
    void refrescarPendientes()
    void vaciarCola(true)

    const alRecuperar = () => {
      setEnLinea(true)
      void vaciarCola(true)
    }
    const alPerder = () => setEnLinea(false)
    // Volver a la pestaña es el otro momento en que hay red sin que llegue el
    // evento `online`: el móvil estuvo bloqueado en el bolsillo.
    const alVolver = () => {
      if (document.visibilityState === 'visible') void vaciarCola(true)
    }

    window.addEventListener('online', alRecuperar)
    window.addEventListener('offline', alPerder)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      window.removeEventListener('online', alRecuperar)
      window.removeEventListener('offline', alPerder)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [refrescarPendientes, vaciarCola])

  const conEstadoLocal = useMemo(
    () => partes.map((p) => ({ ...p, hecho: p.hecho || cerradosEnLocal.has(p.id) })),
    [partes, cerradosEnLocal],
  )

  const pendientesDeHacer = conEstadoLocal.filter((p) => !p.hecho)
  const hechas = conEstadoLocal.filter((p) => p.hecho)

  function alGuardar(parteId: string, cerrado: boolean) {
    if (cerrado) setCerradosEnLocal((previo) => new Set(previo).add(parteId))
    void refrescarPendientes()
    void vaciarCola(true)
  }

  const hayCola = pendientes.partes > 0 || pendientes.fotos > 0

  return (
    <div className="container max-w-2xl space-y-4 py-4 md:py-6">
      <header className="space-y-1">
        <h1 className="titulo-pantalla">{clienteNombre}</h1>
        <p className="texto-meta">
          {formatearFecha(fecha)} · {ETIQUETA_ESTADO_SERVICIO[estado]}
        </p>
        {notas ? <p className="texto-meta">{notas}</p> : null}
      </header>

      {/*
       * Avance y cola. Van juntos porque son la misma pregunta: cuánto queda.
       *
       * `flex-wrap` y un ancho mínimo en el contador, no por adorno: con las dos
       * insignias puestas a la vez (sin cobertura y siete fotos por subir) a
       * 390 px el contador se quedaba sin sitio y "Quedan 9 máquinas" se partía
       * en tres líneas por detrás de los chips.
       */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card p-3">
        <div className="min-w-[9rem] flex-1">
          {/* Un mínimo de 9rem es lo que ocupa "Quedan 12 máquinas" en una línea. */}
          <p className="cifra-dato leading-none">
            {hechas.length}
            <span className="text-meta font-normal text-muted-foreground">
              /{conEstadoLocal.length}
            </span>
          </p>
          <p className="mt-0.5 texto-meta">
            {pendientesDeHacer.length === 0
              ? 'Visita terminada'
              : `Quedan ${plural(pendientesDeHacer.length, 'máquina', 'máquinas')}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!enLinea ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-micro font-medium text-muted-foreground">
              <CloudOff className="h-3.5 w-3.5" /> Sin cobertura
            </span>
          ) : null}

          {hayCola ? (
            <Button
              variant="outline"
              size="sm"
              disabled={subiendo || !enLinea}
              onClick={() => void vaciarCola(false)}
            >
              {subiendo ? <RefreshCw className="animate-spin" /> : <Upload />}
              {pendientes.fotos > 0
                ? `${plural(pendientes.fotos, 'foto', 'fotos')} · ${tamano(pendientes.bytes)}`
                : plural(pendientes.partes, 'parte', 'partes')}
            </Button>
          ) : null}
        </div>
      </div>

      {pendientesDeHacer.length > 0 ? (
        <section className="space-y-2">
          <h2 className="titulo-seccion">Por hacer</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {pendientesDeHacer.map((p) => (
              <FilaParte key={p.id} parte={p} onAbrir={() => setAbierto(p)} />
            ))}
          </ul>
        </section>
      ) : null}

      {hechas.length > 0 ? (
        <section className="space-y-2">
          <h2 className="titulo-seccion">Hechas</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {hechas.map((p) => (
              <FilaParte key={p.id} parte={p} onAbrir={() => setAbierto(p)} />
            ))}
          </ul>
        </section>
      ) : null}

      {abierto ? (
        <ParteMaquina
          parte={abierto}
          servicioId={servicioId}
          clienteId={clienteId}
          onCerrar={() => setAbierto(null)}
          onGuardado={alGuardar}
        />
      ) : null}
    </div>
  )
}

function FilaParte({ parte, onAbrir }: { parte: ParteTrabajo; onAbrir: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onAbrir}
        className="flex min-h-[56px] w-full items-center gap-3 px-3 py-3 text-left transition-colors duration-rapido ease-estandar hover:bg-accent"
      >
        {parte.hecho ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ok text-ok-foreground">
            <Check className="h-4 w-4" />
          </span>
        ) : (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center">
            <PuntoSemaforo estado={parte.estadoMaquina} />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <span className={parte.hecho ? 'titulo-tarjeta opacity-60' : 'titulo-tarjeta'}>
            {parte.nombre}
          </span>
          <p className="mt-0.5 truncate texto-meta">
            {[ETIQUETA_TIPO_MAQUINA[parte.tipo], parte.ubicacion, parte.marca]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </button>
    </li>
  )
}
