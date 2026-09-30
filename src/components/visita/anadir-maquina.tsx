import { useCallback, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { parqueDeBox } from '@/datos/parque'
import { anadirMaquinaAVisita } from '@/datos/visitas'
import { ETIQUETA_TIPO_MAQUINA } from '@/lib/roles'
import type { MaquinaFila } from '@/lib/parque'
import { PuntoSemaforo } from '@/components/chip-semaforo'
import { IconoMaquina } from '@/components/icono-maquina'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EstadoError, EstadoVacio } from '@/components/ui/states'
import { SkeletonLista } from '@/components/ui/skeleton'

/**
 * Añadir a la visita una máquina que no estaba prevista.
 *
 * `anadirMaquinaAVisita` existe desde la fase de planificación —con su comentario
 * («una máquina que aparece sobre la marcha, pasa más de lo que parece»)— pero no
 * la llamaba nadie: no había ninguna superficie para usarla. En el box, esa
 * máquina acababa fuera del informe, o el técnico paraba a planificar otra visita,
 * que es exactamente el rodeo que el principio 1 del proyecto prohíbe.
 *
 * Añadir una máquina necesita escribir en el servidor, así que esto sí pide
 * cobertura, y lo dice: mejor decirlo que fallar en silencio.
 */
export function AnadirMaquina({
  servicioId,
  clienteId,
  yaEnLaVisita,
  onAnadida,
}: {
  servicioId: string
  clienteId: string
  /** Las máquinas que ya tienen parte en esta visita, por id. */
  yaEnLaVisita: Set<string>
  onAnadida: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [parque, setParque] = useState<MaquinaFila[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [anadiendo, setAnadiendo] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    setParque(null)
    try {
      setParque(await parqueDeBox(clienteId))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No hemos podido leer el parque del box.')
    }
  }, [clienteId])

  function abrir() {
    setAbierto(true)
    void cargar()
  }

  async function anadir(maquina: MaquinaFila) {
    setAnadiendo(maquina.id)
    const r = await anadirMaquinaAVisita(servicioId, maquina.id)
    setAnadiendo(null)

    if (!r.ok) {
      toast.error('No hemos podido añadirla', {
        description: 'Hace falta cobertura para meter una máquina nueva en la visita.',
      })
      return
    }

    toast.success(`${maquina.nombre} está en la visita`)
    onAnadida()
    setAbierto(false)
  }

  // Solo lo que de verdad se puede añadir: lo que ya está, activo y no dado de baja.
  const candidatas = (parque ?? []).filter((m) => m.activa && !yaEnLaVisita.has(m.id))

  return (
    <>
      <Button variant="outline" size="sm" onClick={abrir}>
        <Plus /> Añadir máquina
      </Button>

      {abierto ? (
        <Dialog open onOpenChange={(v) => (v ? null : setAbierto(false))}>
          <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Añadir a la visita</DialogTitle>
              <p className="texto-meta">Máquinas del parque que no están en esta visita.</p>
            </DialogHeader>

            {error !== null ? (
              <EstadoError descripcion={error} onReintentar={() => void cargar()} />
            ) : parque === null ? (
              <SkeletonLista filas={5} />
            ) : candidatas.length === 0 ? (
              <EstadoVacio
                titulo="No queda ninguna por añadir"
                descripcion="Todas las máquinas activas del box ya están en esta visita."
              />
            ) : (
              <ul className="divide-y rounded-lg border">
                {candidatas.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      disabled={anadiendo !== null}
                      onClick={() => void anadir(m)}
                      className="flex min-h-[56px] w-full items-center gap-3 px-3 py-3 text-left transition-colors duration-rapido ease-estandar hover:bg-accent disabled:opacity-60"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                        <PuntoSemaforo estado={m.estado} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <IconoMaquina tipo={m.tipo} className="text-muted-foreground" />
                          <span className="titulo-tarjeta truncate">{m.nombre}</span>
                        </span>
                        <span className="mt-0.5 block truncate texto-meta">
                          {[ETIQUETA_TIPO_MAQUINA[m.tipo], m.ubicacion, m.marca]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      {anadiendo === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}