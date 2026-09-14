import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { MomentoFoto, Semaforo } from '@/lib/database.types'
import { ETIQUETA_SEMAFORO, CLASE_SEMAFORO, admiteDamper } from '@/lib/roles'
import { componerTrabajoHecho, protocoloDe } from '@/lib/protocolos'
import { comprimirFoto } from '@/lib/foto'
import {
  borrarFotoLocal,
  encolarFoto,
  fotosDe,
  guardarParteLocal,
  type FotoEncolada,
} from '@/lib/cola-visita'
import { urlsDeFotos, type FotoDeParte, type ParteTrabajo } from '@/datos/visitas'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { GaleriaFotos } from '@/components/galeria-fotos'

const ESTADOS: Semaforo[] = ['verde', 'ambar', 'rojo', 'sin_revisar']

/**
 * El parte de una máquina (EBX-203 y EBX-204).
 *
 * Todo lo que se puede pulsar se pulsa. El estado son cuatro botones grandes en
 * vez de un desplegable, el trabajo hecho son casillas del protocolo del tipo de
 * máquina, y solo queda un campo de texto para lo que se salió del guion.
 *
 * La escritura va SIEMPRE a la cola local, haya cobertura o no. Un único camino:
 * con dos, el de sin cobertura sería el que nunca se prueba, y es el que importa.
 */
export function ParteMaquina({
  parte,
  servicioId,
  clienteId,
  onCerrar,
  onGuardado,
}: {
  parte: ParteTrabajo
  servicioId: string
  clienteId: string
  onCerrar: () => void
  onGuardado: (parteId: string, cerrado: boolean) => void
}) {
  const protocolo = protocoloDe(parte.tipo)

  // El estado de partida es el que tiene la máquina hoy: en el caso normal se
  // confirma con cero toques.
  const [estadoAntes, setEstadoAntes] = useState<Semaforo>(parte.estadoAntes ?? parte.estadoMaquina)
  const [estadoDespues, setEstadoDespues] = useState<Semaforo>(parte.estadoDespues ?? 'verde')
  const [marcados, setMarcados] = useState<Set<string>>(() => {
    // Al reabrir un parte hecho, se recuperan las casillas que ya estaban.
    const previos = parte.trabajoHecho?.split(' · ') ?? []
    return new Set(protocolo.pasos.filter((p) => previos.includes(p)))
  })
  const [extra, setExtra] = useState(() => {
    const previos = parte.trabajoHecho?.split(' · ') ?? []
    return previos.filter((p) => !protocolo.pasos.includes(p)).join(' · ')
  })
  /*
   * Cada cuánto vuelve a tocar. Se propone la que ya tiene la máquina, así que en
   * el caso normal son cero toques; y si nunca tuvo, se propone «no repetir», que
   * es la verdad de esa máquina hasta que alguien decida otra cosa.
   */
  const [cadencia, setCadencia] = useState<number>(
    parte.cadenciaSugeridaMeses ?? parte.cadenciaMaquinaMeses ?? 0,
  )
  const [piezas, setPiezas] = useState(parte.piezas ?? '')
  const [damper, setDamper] = useState(parte.damper?.toString() ?? '')
  const [dragFactor, setDragFactor] = useState(parte.dragFactor?.toString() ?? '')

  const [locales, setLocales] = useState<FotoEncolada[]>([])
  const [subidas, setSubidas] = useState<FotoDeParte[]>([])
  /*
   * Las ya subidas que no se han podido ni comprobar.
   *
   * Sin red, pedir las URLs firmadas falla y la galería se quedaba vacía, que se
   * lee exactamente igual que «esta máquina no tiene fotos». Reabrir una máquina
   * ya hecha sin cobertura —lo normal al repasar el trabajo— enseñaba «Hacer
   * foto» y el técnico volvía a hacer las que ya existían. Son dos estados
   * distintos y ahora se distinguen.
   */
  const [sinComprobar, setSinComprobar] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const inputAntes = useRef<HTMLInputElement>(null)
  const inputDespues = useRef<HTMLInputElement>(null)

  const recargarFotos = useCallback(async () => {
    setLocales(await fotosDe(parte.id))
  }, [parte.id])

  useEffect(() => {
    void recargarFotos()
    // Las ya subidas se piden firmadas. Si no hay red, la llamada falla y se
    // queda con las locales, que es exactamente lo que hay que enseñar — pero
    // diciendo que no se han podido comprobar.
    urlsDeFotos(parte.id)
      .then((fotos) => {
        setSubidas(fotos)
        setSinComprobar(false)
      })
      .catch(() => {
        setSubidas([])
        setSinComprobar(true)
      })
  }, [parte.id, recargarFotos])

  /**
   * Borrar una foto, con cinco segundos para volver atrás.
   *
   * Deshacer y no preguntar: el botón está pegado a la miniatura y al de hacer
   * otra foto, así que el roce se da con guantes y sin mirar. Un diálogo de
   * confirmación cuesta un toque más cada vez; el «deshacer» solo cuesta ese
   * toque cuando de verdad se ha borrado algo sin querer. La foto sigue en
   * memoria, así que recuperarla es volver a encolarla con el mismo id (que es
   * el nombre del fichero en el bucket: reintentar no duplica nada).
   */
  async function borrarFoto(id: string) {
    const foto = locales.find((f) => f.id === id)
    await borrarFotoLocal(id)
    await recargarFotos()
    if (!foto) return

    toast('Foto borrada', {
      action: {
        label: 'Deshacer',
        onClick: () => {
          void encolarFoto({
            id: foto.id,
            parteId: foto.parteId,
            clienteId: foto.clienteId,
            servicioId: foto.servicioId,
            momento: foto.momento,
            orden: foto.orden,
            blob: foto.blob,
            bytes: foto.bytes,
          }).then(recargarFotos)
        },
      },
    })
  }

  async function anadirFotos(momento: MomentoFoto, ficheros: FileList | null) {
    if (!ficheros || ficheros.length === 0) return
    setProcesando(true)
    try {
      const yaHay = (await fotosDe(parte.id)).filter((f) => f.momento === momento).length
      let orden = yaHay + subidas.filter((f) => f.momento === momento).length

      for (const fichero of Array.from(ficheros)) {
        const comprimida = await comprimirFoto(fichero)
        await encolarFoto({
          id: crypto.randomUUID(),
          parteId: parte.id,
          clienteId,
          servicioId,
          momento,
          orden: orden++,
          blob: comprimida.blob,
          bytes: comprimida.bytes,
        })
      }
      await recargarFotos()
    } catch {
      toast.error('No hemos podido guardar la foto', {
        description: 'Vuelve a hacerla. Si insiste, usa la cámara del móvil como respaldo.',
      })
    } finally {
      setProcesando(false)
    }
  }

  async function guardar(cerrar: boolean) {
    setGuardando(true)
    try {
      const pasosMarcados = protocolo.pasos.filter((p) => marcados.has(p))
      await guardarParteLocal({
        parteId: parte.id,
        servicioId,
        trabajoHecho: componerTrabajoHecho(pasosMarcados, extra),
        piezas: piezas.trim() || null,
        estadoAntes,
        /*
         * «Cómo queda» se guarda siempre, también en el guardado a medias.
         *
         * Antes iba a null si no se cerraba el parte, así que el semáforo que el
         * técnico acababa de elegir —y que es lo que el cliente ve en su box—
         * se descartaba sin decir nada al pulsar «Guardar y seguir». Si se ha
         * revisado la máquina, hay un «cómo queda», se cierre el parte o no.
         */
        estadoDespues,
        damper: damper === '' ? null : Number(damper),
        dragFactor: dragFactor === '' ? null : Number(dragFactor),
        minutos: null,
        cadenciaSugeridaMeses: cadencia,
        hecho: cerrar,
      })
      onGuardado(parte.id, cerrar)
      onCerrar()
    } catch {
      toast.error('No hemos podido guardar el parte')
    } finally {
      setGuardando(false)
    }
  }

  /*
   * ¿Se ha tocado algo que no se haya guardado?
   *
   * La hoja se cierra con un toque fuera y con Escape, y eso desmonta el
   * componente con todo lo marcado dentro: con guantes y el móvil en una mano, el
   * roce se da. Las fotos no corren peligro (van a la cola al elegirlas), pero
   * las casillas y el texto sí. Por eso, cuando hay cambios sin guardar, el toque
   * fuera y Escape no cierran: avisan. La X sigue cerrando, que esa sí es a
   * propósito.
   */
  const firma = [
    estadoAntes,
    estadoDespues,
    [...marcados].sort().join('|'),
    extra,
    piezas,
    damper,
    dragFactor,
    cadencia,
  ].join('~')
  const firmaInicial = useRef(firma)
  const sinGuardar = firma !== firmaInicial.current

  function bloquearCierre(evento: { preventDefault: () => void }) {
    evento.preventDefault()
    toast('Tienes cambios sin guardar', {
      description: 'Pulsa «Guardar y seguir» o «Terminada», o cierra con la X para descartarlos.',
    })
  }

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onCerrar())}>
      <DialogContent
        className="max-h-[92dvh] max-w-lg overflow-y-auto"
        onPointerDownOutside={sinGuardar ? bloquearCierre : undefined}
        onEscapeKeyDown={sinGuardar ? bloquearCierre : undefined}
      >
        <DialogHeader>
          <DialogTitle>{parte.nombre}</DialogTitle>
          <p className="texto-meta">
            {[parte.marca, parte.numSerie ? `nº ${parte.numSerie}` : null, parte.ubicacion]
              .filter(Boolean)
              .join(' · ') || 'Sin datos de ficha'}
          </p>
        </DialogHeader>

        <div className="space-y-5">
          <Semaforos titulo="Cómo estaba" valor={estadoAntes} onCambio={setEstadoAntes} />

          <GaleriaFotos
            titulo="Fotos de antes"
            momento="antes"
            locales={locales}
            subidas={subidas}
            sinComprobar={sinComprobar}
            procesando={procesando}
            inputRef={inputAntes}
            onElegir={(f) => void anadirFotos('antes', f)}
            onBorrar={borrarFoto}
          />

          <div className="space-y-2">
            {/* Un contador de pasos: marca el ritmo. Con la máquina abierta y los
                guantes puestos, saber que vas 4 de 6 es lo que evita cerrar el
                parte con la mitad sin marcar. */}
            <div className="flex items-baseline justify-between gap-2">
              <Label>Trabajo hecho</Label>
              <span className="texto-micro tabular-nums text-muted-foreground">
                {marcados.size}/{protocolo.pasos.length}
              </span>
            </div>
            <ul className="divide-y rounded-lg border">
              {protocolo.pasos.map((paso) => (
                <li key={paso}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={marcados.has(paso)}
                      onChange={() =>
                        setMarcados((previo) => {
                          const siguiente = new Set(previo)
                          if (siguiente.has(paso)) siguiente.delete(paso)
                          else siguiente.add(paso)
                          return siguiente
                        })
                      }
                      className="h-5 w-5 shrink-0 rounded border-input"
                    />
                    <span className="text-cuerpo">{paso}</span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="text-meta text-primary underline-offset-2 hover:underline"
              onClick={() =>
                setMarcados(
                  marcados.size === protocolo.pasos.length ? new Set() : new Set(protocolo.pasos),
                )
              }
            >
              {marcados.size === protocolo.pasos.length ? 'Desmarcar todo' : 'Marcar todo'}
            </button>
          </div>

          <GaleriaFotos
            titulo="Fotos de después"
            momento="despues"
            locales={locales}
            subidas={subidas}
            sinComprobar={sinComprobar}
            procesando={procesando}
            inputRef={inputDespues}
            onElegir={(f) => void anadirFotos('despues', f)}
            onBorrar={borrarFoto}
          />

          <div className="space-y-1.5">
            <Label htmlFor="parte-extra">Algo más</Label>
            <Textarea
              id="parte-extra"
              rows={2}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="Lo que se salió del guion"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="parte-piezas">Piezas y consumibles</Label>
            <Input
              id="parte-piezas"
              value={piezas}
              onChange={(e) => setPiezas(e.target.value)}
              placeholder="Cadena, cuerda, pila…"
            />
          </div>

          {admiteDamper(parte.tipo) ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="parte-damper">Damper</Label>
                <Input
                  id="parte-damper"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={10}
                  value={damper}
                  onChange={(e) => setDamper(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="parte-drag">Drag factor</Label>
                <Input
                  id="parte-drag"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={300}
                  value={dragFactor}
                  onChange={(e) => setDragFactor(e.target.value)}
                  placeholder="199"
                />
              </div>
            </div>
          ) : null}

          <Semaforos titulo="Cómo queda" valor={estadoDespues} onCambio={setEstadoDespues} />

          <Cadencia valor={cadencia} onCambio={setCadencia} />
        </div>

        {/* Pegado abajo: en una ficha larga, el botón de terminar no puede estar
            a un desplazamiento de distancia cuando tienes las manos ocupadas. */}
        <div className="sticky bottom-0 -mx-6 -mb-6 flex gap-2 border-t bg-background/95 px-6 py-3 backdrop-blur">
          <Button
            variant="outline"
            className="flex-1"
            disabled={guardando}
            onClick={() => void guardar(false)}
          >
            Guardar y seguir
          </Button>
          <Button className="flex-1" disabled={guardando} onClick={() => void guardar(true)}>
            {guardando ? <Loader2 className="animate-spin" /> : <Check />}
            Terminada
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Cada cuánto vuelve a tocar esta máquina.
 *
 * Va al final, después de «cómo queda», porque es la última decisión y solo se
 * puede tomar bien con la máquina ya revisada delante: hasta que no se ha abierto
 * no se sabe si aguanta seis meses o hay que volver en dos.
 *
 * Seis opciones y no un campo numérico. Las cadencias de este negocio se cuentan
 * con los dedos de una mano, y escribir un número en un móvil con las manos
 * sucias es exactamente lo que este producto evita en todas las demás pantallas.
 */
const CADENCIAS = [1, 2, 3, 6, 12, 0] as const

function etiquetaCadencia(meses: number): string {
  if (meses === 0) return 'No repetir'
  if (meses === 1) return '1 mes'
  if (meses === 12) return '1 año'
  return `${meses} meses`
}

function Cadencia({ valor, onCambio }: { valor: number; onCambio: (m: number) => void }) {
  /*
   * Si la máquina viene con una cadencia que no está en la lista —importada de un
   * CSV con un 5, por ejemplo— se añade como opción en vez de dejar el selector
   * sin nada marcado. Un selector sin selección se lee como «no hay cadencia», y
   * aquí sí la hay.
   */
  const opciones = CADENCIAS.includes(valor as (typeof CADENCIAS)[number])
    ? [...CADENCIAS]
    : [valor, ...CADENCIAS]

  return (
    <div className="space-y-2">
      <Label>Vuelve a tocar dentro de</Label>
      <div className="grid grid-cols-3 gap-2">
        {opciones.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={valor === m}
            onClick={() => onCambio(m)}
            className={
              valor === m
                ? 'flex min-h-[44px] items-center justify-center rounded-md bg-primary px-1 text-micro font-semibold leading-tight text-primary-foreground'
                : 'flex min-h-[44px] items-center justify-center rounded-md border border-input px-1 text-micro font-medium leading-tight text-muted-foreground transition-colors duration-rapido ease-estandar hover:bg-accent'
            }
          >
            {etiquetaCadencia(m)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Cuatro botones grandes. Un desplegable aquí cuesta tres toques en vez de uno. */
function Semaforos({
  titulo,
  valor,
  onCambio,
}: {
  titulo: string
  valor: Semaforo
  onCambio: (s: Semaforo) => void
}) {
  return (
    <div className="space-y-2">
      <Label>{titulo}</Label>
      <div className="grid grid-cols-4 gap-2">
        {ESTADOS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={valor === s}
            onClick={() => onCambio(s)}
            className={
              valor === s
                ? `flex min-h-[44px] items-center justify-center rounded-md px-1 text-micro font-semibold ${CLASE_SEMAFORO[s]}`
                : 'flex min-h-[44px] items-center justify-center rounded-md border border-input px-1 text-micro font-medium text-muted-foreground transition-colors duration-rapido ease-estandar hover:bg-accent'
            }
          >
            {ETIQUETA_SEMAFORO[s]}
          </button>
        ))}
      </div>
    </div>
  )
}
