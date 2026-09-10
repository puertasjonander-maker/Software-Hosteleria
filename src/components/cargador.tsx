import { useEffect } from 'react'
import type { Consulta } from '@/lib/consulta'
import { EstadoError } from '@/components/ui/states'

/**
 * Los tres estados de una pantalla que pide datos, en un sitio.
 *
 * Sin esto, cada una de las diez pantallas repetía el mismo `if (cargando)` y el
 * mismo `if (error)`, y la regla 4 del BUILD_SPEC —ninguna pantalla en blanco—
 * dependía de que nadie se dejara uno. Aquí no se puede dejar: para pintar los
 * datos hay que pasar por la función, y la función solo se llama cuando existen.
 */
export function Cargador<T>({
  consulta,
  esqueleto,
  children,
}: {
  consulta: Consulta<T>
  /** La forma de lo que viene. Un spinner centrado salta más al aparecer. */
  esqueleto: React.ReactNode
  children: (datos: T) => React.ReactNode
}) {
  if (consulta.error !== null) {
    return <EstadoError descripcion={consulta.error} onReintentar={consulta.recargar} />
  }

  // Con datos ya cargados no se vuelve al esqueleto: al recargar tras guardar,
  // la pantalla parpadearía entera para acabar enseñando casi lo mismo.
  if (consulta.datos === null) {
    return consulta.cargando ? <>{esqueleto}</> : null
  }

  return <>{children(consulta.datos)}</>
}

/**
 * El título de la pestaña.
 *
 * En una aplicación de una sola página no lo cambia nadie por su cuenta: el
 * documento se carga una vez y el título se queda con el que traía.
 */
export function useTitulo(titulo: string | null) {
  useEffect(() => {
    document.title = titulo ? `${titulo} · Ergobox` : 'Ergobox'
  }, [titulo])
}
