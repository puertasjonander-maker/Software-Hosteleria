import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Check, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { MomentoFoto, Semaforo } from '@/lib/database.types'
import { ETIQUETA_SEMAFORO, CLASE_SEMAFORO, admiteDamper } from '@/lib/roles'
import { componerTrabajoHecho, protocoloDe } from '@/lib/protocolos'
import { comprimirFoto, tamano } from '@/lib/foto'
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
  const [piezas, setPiezas] = useState(parte.piezas ?? '')
  const [damper, setDamper] = useState(parte.damper?.toString() ?? '')
  const [dragFactor, setDragFactor] = useState(parte.dragFactor?.toString() ?? '')

  const [locales, setLocales] = useState<FotoEncolada[]>([])
  const [subidas, setSubidas] = useState<FotoDeParte[]>([])
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
    // queda con las locales, que es exactamente lo que hay que enseñar.
    urlsDeFotos(parte.id)
      .then(setSubidas)
      .catch(() => setSubidas([]))
  }, [parte.id, recargarFotos])

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
        estadoDespues: cerrar ? estadoDespues : null,
        damper: damper === '' ? null : Number(damper),
        dragFactor: dragFactor === '' ? null : Number(dragFactor),
        minutos: null,
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

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onCerrar())}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
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

          <Fotos
            titulo="Fotos de antes"
            momento="antes"
            locales={locales}
            subidas={subidas}
            procesando={procesando}
            inputRef={inputAntes}
            onElegir={(f) => void anadirFotos('antes', f)}
            onBorrar={async (id) => {
              await borrarFotoLocal(id)
              await recargarFotos()
            }}
          />

          <div className="space-y-2">
            <Label>Trabajo hecho</Label>
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

          <Fotos
            titulo="Fotos de después"
            momento="despues"
            locales={locales}
            subidas={subidas}
            procesando={procesando}
            inputRef={inputDespues}
            onElegir={(f) => void anadirFotos('despues', f)}
            onBorrar={async (id) => {
              await borrarFotoLocal(id)
              await recargarFotos()
            }}
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

function Fotos({
  titulo,
  momento,
  locales,
  subidas,
  procesando,
  inputRef,
  onElegir,
  onBorrar,
}: {
  titulo: string
  momento: MomentoFoto
  locales: FotoEncolada[]
  subidas: FotoDeParte[]
  procesando: boolean
  inputRef: React.RefObject<HTMLInputElement>
  onElegir: (ficheros: FileList | null) => void
  onBorrar: (id: string) => Promise<void>
}) {
  const mias = locales.filter((f) => f.momento === momento)
  const suyas = subidas.filter((f) => f.momento === momento)

  /*
   * Un object URL por foto en cola, creado una vez y revocado al desmontar.
   * Crearlos dentro del render los filtraría en cada repintado, y en una visita
   * de doce máquinas eso es memoria que no vuelve.
   */
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    const creados: Record<string, string> = {}
    for (const f of mias) creados[f.id] = URL.createObjectURL(f.blob)
    setUrls(creados)
    return () => {
      for (const url of Object.values(creados)) URL.revokeObjectURL(url)
    }
    // Solo cuando cambia el conjunto de fotos, no en cada repintado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mias.map((f) => f.id).join(',')])

  const total = mias.length + suyas.length

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label>{titulo}</Label>
        {mias.length > 0 ? (
          <span className="texto-micro text-muted-foreground">
            {tamano(mias.reduce((s, f) => s + f.bytes, 0))} sin subir
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {suyas.map((f) => (
          <img
            key={f.id}
            src={f.url}
            alt=""
            className="h-20 w-20 rounded-md border object-cover"
          />
        ))}

        {mias.map((f) => (
          <div key={f.id} className="relative">
            <img
              src={urls[f.id]}
              alt=""
              className="h-20 w-20 rounded-md border border-dashed object-cover"
            />
            <button
              type="button"
              aria-label="Borrar foto"
              onClick={() => void onBorrar(f.id)}
              className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={procesando}
          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground transition-colors duration-rapido ease-estandar hover:bg-accent disabled:opacity-50"
        >
          {procesando ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Camera className="h-5 w-5" />
              <span className="text-micro">{total === 0 ? 'Hacer foto' : 'Otra'}</span>
            </>
          )}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          // `capture` abre la cámara directamente en el móvil en vez de la
          // galería: es un toque menos con las manos sucias.
          capture="environment"
          multiple
          className="sr-only"
          onChange={(e) => {
            onElegir(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
