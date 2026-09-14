import { useEffect } from 'react'
import type { Consulta } from '@/lib/consulta'
import { AvisoDesactualizado, EstadoError } from '@/components/ui/states'

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
  /*
   * Un fallo con datos ya en pantalla no se lleva la pantalla por delante.
   *
   * Se descubrió en la pantalla que más duele: en una visita sin cobertura real
   * —nave metálica, portal cautivo—, la recarga que se dispara sola después de
   * cada parte falla y sustituía las doce máquinas por «No hemos podido cargar
   * esto». La cola seguía intacta, pero el técnico no podía trabajar: el
   * principio 5 dice que el sistema nunca bloquea el trabajo, y una lista que ya
   * estaba en memoria no tiene por qué desaparecer porque no se pudo refrescar.
   *
   * Se avisa arriba, en ámbar y sin tapar nada, con la opción de reintentar.
   */
  if (consulta.error !== null) {
    if (consulta.datos === null) {
      return <EstadoError descripcion={consulta.error} onReintentar={consulta.recargar} />
    }

    return (
      <>
        <div className="container max-w-2xl px-4 pt-3">
          <AvisoDesactualizado onReintentar={consulta.recargar} />
        </div>
        {children(consulta.datos)}
      </>
    )
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
