import { useEffect, useState } from 'react'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import type { MomentoFoto } from '@/lib/database.types'
import { tamano, type FotoSubida } from '@/lib/foto'
import type { FotoEncolada } from '@/lib/cola-visita'
import { Label } from '@/components/ui/label'

/**
 * Hacer fotos y ver las que ya hay.
 *
 * Vivía dentro del parte de una máquina y se sacó aquí al aparecer el segundo
 * sitio que las necesita: el inventario, donde una máquina recién dada de alta
 * lleva sus fotos de cómo llegó y todavía no hay ningún parte del que colgarlas.
 *
 * Compartido a propósito, y no copiado. Lo de las fotos tiene tres detalles que
 * se aprendieron a base de romperlos —los object URL que hay que revocar, el
 * `capture` que ahorra un toque, y el `value = ''` que deja repetir la misma
 * foto— y mantener dos copias de eso es garantizar que una de las dos se queda
 * atrás.
 */
export function GaleriaFotos({
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
  subidas: FotoSubida[]
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
          <img key={f.id} src={f.url} alt="" className="h-20 w-20 rounded-md border object-cover" />
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
            // Sin esto, volver a elegir el mismo fichero no dispara `change` y la
            // segunda foto de la misma máquina se pierde en silencio.
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
