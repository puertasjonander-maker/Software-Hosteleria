import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Loader2, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useOcupado } from '@/lib/ocupado'
import { plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EstadoVacio } from '@/components/ui/states'
import { BarraSalud } from '@/components/resumen-parque'
import { guardarBox, type BoxResumen } from '@/datos/boxes'

export function GestionBoxes({
  boxes,
  puedeCrear,
  onCambio,
}: {
  boxes: BoxResumen[]
  puedeCrear: boolean
  /** Recarga la lista tras crear. La pantalla es quien sabe cómo pedirla. */
  onCambio: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [poblacion, setPoblacion] = useState('')
  const [guardando, iniciar] = useOcupado()
  const [creando, setCreando] = useState(false)
  const [filtro, setFiltro] = useState('')

  function crear() {
    if (!nombre.trim()) return
    iniciar(async () => {
      const r = await guardarBox(null, {
        nombre: nombre.trim(),
        direccion: null,
        poblacion: poblacion.trim() || null,
        contactoNombre: null,
        contactoTelefono: null,
        contactoEmail: null,
        notas: null,
        activo: true,
      })
      if (r.ok) {
        setNombre('')
        setPoblacion('')
        setCreando(false)
        toast.success('Box creado')
        onCambio()
      } else {
        toast.error(r.mensaje)
      }
    })
  }

  const visibles = boxes.filter((b) =>
    `${b.nombre} ${b.poblacion ?? ''}`.toLowerCase().includes(filtro.trim().toLowerCase()),
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {boxes.length > 5 ? (
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar box o población"
              className="pl-9"
              aria-label="Buscar box"
            />
          </div>
        ) : (
          <p className="min-w-0 flex-1 texto-meta">
            {boxes.length > 0 ? plural(boxes.length, 'box', 'boxes') : ''}
          </p>
        )}
        {puedeCrear ? (
          <Button onClick={() => setCreando(true)} className="shrink-0">
            <Plus /> Nuevo box
          </Button>
        ) : null}
      </div>

      <Dialog open={creando} onOpenChange={setCreando}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo box</DialogTitle>
            <DialogDescription>
              Luego se importa su parque desde la ficha del box.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="nuevo-box">Nombre del box</Label>
              <Input
                id="nuevo-box"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') crear()
                }}
                placeholder="CrossFit IronBuster"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nueva-poblacion">Población</Label>
              <Input
                id="nueva-poblacion"
                value={poblacion}
                onChange={(e) => setPoblacion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') crear()
                }}
                placeholder="Pizarra"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={crear} disabled={!nombre.trim() || guardando}>
              {guardando ? <Loader2 className="animate-spin" /> : <Plus />}
              Añadir box
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {boxes.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay ningún box"
          descripcion={
            puedeCrear
              ? 'Pulsa «Nuevo box» y después importa su parque desde la ficha.'
              : 'Pídele a administración que dé de alta el primero.'
          }
        />
      ) : (
        /*
         * Lista de tarjetas y no tabla: esta pantalla se abre de camino al box,
         * en el móvil, y solo se busca «cuál era y cómo está». Cada tarjeta trae
         * la barra de salud de su parque, así que el estado se lee sin entrar.
         */
        <ul className="space-y-2.5">
          {visibles.map((b) => (
            <li key={b.id}>
              <Link
                to={`/boxes/${b.id}`}
                className="block rounded-xl border bg-card p-4 shadow-sm transition-colors duration-rapido ease-estandar hover:bg-accent/40 active:bg-accent"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate titulo-tarjeta">{b.nombre}</span>
                      {!b.activo ? (
                        <span className="shrink-0 rounded-full border px-2 py-0.5 text-micro font-semibold text-muted-foreground">
                          Inactivo
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate texto-meta">
                      {[b.poblacion, b.contactoNombre].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                    </p>
                  </div>
                  {b.vencidas > 0 ? (
                    <span className="shrink-0 rounded-full bg-destructive-soft px-2.5 py-1 text-micro font-semibold text-destructive-soft-foreground">
                      {plural(b.vencidas, 'vencida', 'vencidas')}
                    </span>
                  ) : null}
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>

                <div className="mt-3 flex items-center gap-3">
                  {b.maquinas > 0 ? (
                    <>
                      <BarraSalud resumen={b.resumen} className="flex-1" />
                      <span className="shrink-0 texto-meta tabular-nums">
                        {plural(b.maquinas, 'máquina', 'máquinas')}
                      </span>
                    </>
                  ) : (
                    <span className="texto-meta">Sin parque todavía</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
          {visibles.length === 0 ? (
            <li className="py-6 text-center texto-meta">Ningún box coincide con «{filtro}».</li>
          ) : null}
        </ul>
      )}
    </div>
  )
}
