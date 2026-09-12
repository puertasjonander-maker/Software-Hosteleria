import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { comprimirFoto, type FotoSubida } from '@/lib/foto'
import {
  borrarFotoLocal,
  encolarFoto,
  fotosDeMaquina,
  sincronizar,
  type FotoEncolada,
} from '@/lib/cola-visita'
import { urlsFotosDeMaquina } from '@/datos/parque'
import { GaleriaFotos } from '@/components/galeria-fotos'

/**
 * Las fotos de cómo llegó una máquina (EBX-105).
 *
 * Al inventariar un box por primera vez no hay ningún parte todavía, así que
 * estas fotos cuelgan de la máquina. Son las que se miran tres meses después,
 * cuando alguien pregunta si ese óxido ya estaba, y por eso hacen falta justo en
 * el momento en el que no hay nada de donde colgarlas.
 *
 * Mismo camino que en el trabajo de campo: se comprimen, van a la cola local y
 * de ahí a Supabase. Un inventario se hace dentro del box, que es exactamente el
 * sitio donde no hay cobertura.
 *
 * Esta sección es la de hacerlas, y solo sale en la pantalla interna. Para el
 * cliente no hay una sección aparte: sus fotos de inventario salen en el
 * histórico, colgadas de la línea del alta, que es donde se cuenta cómo llegó la
 * máquina. Enseñárselas dos veces en la misma pantalla sería repetirse.
 */
export function FotosMaquina({
  maquinaId,
  clienteId,
}: {
  maquinaId: string
  clienteId: string
}) {
  const [locales, setLocales] = useState<FotoEncolada[]>([])
  const [subidas, setSubidas] = useState<FotoSubida[]>([])
  const [procesando, setProcesando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  const recargarLocales = useCallback(async () => {
    setLocales(await fotosDeMaquina(maquinaId))
  }, [maquinaId])

  const recargarSubidas = useCallback(async () => {
    // Sin red la llamada falla y se queda con las locales, que es justo lo que
    // hay que enseñar en ese caso.
    try {
      setSubidas(await urlsFotosDeMaquina(maquinaId))
    } catch {
      setSubidas([])
    }
  }, [maquinaId])

  useEffect(() => {
    void recargarLocales()
    void recargarSubidas()
  }, [recargarLocales, recargarSubidas])

  async function anadir(ficheros: FileList | null) {
    if (!ficheros || ficheros.length === 0) return
    setProcesando(true)
    try {
      let orden = locales.length + subidas.length

      for (const fichero of Array.from(ficheros)) {
        const comprimida = await comprimirFoto(fichero)
        await encolarFoto({
          id: crypto.randomUUID(),
          maquinaId,
          clienteId,
          // Una foto de inventario es siempre un «antes»: cuenta cómo estaba la
          // máquina cuando la encontramos, no cómo quedó después de nada.
          momento: 'antes',
          orden: orden++,
          blob: comprimida.blob,
          bytes: comprimida.bytes,
        })
      }

      await recargarLocales()

      // Se intenta subir en cuanto se hace la foto. Si no hay red no pasa nada:
      // la cola se vacía sola al recuperarla.
      void sincronizar().then(recargarLocales).then(recargarSubidas)
    } catch {
      toast.error('No hemos podido guardar la foto', {
        description: 'Vuelve a hacerla. Si insiste, usa la cámara del móvil como respaldo.',
      })
    } finally {
      setProcesando(false)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="titulo-seccion">Cómo llegó</h2>
      <GaleriaFotos
        titulo="Fotos del inventario"
        momento="antes"
        locales={locales}
        subidas={subidas}
        procesando={procesando}
        inputRef={entrada}
        onElegir={(f) => void anadir(f)}
        onBorrar={async (id) => {
          await borrarFotoLocal(id)
          await recargarLocales()
        }}
      />
    </section>
  )
}
