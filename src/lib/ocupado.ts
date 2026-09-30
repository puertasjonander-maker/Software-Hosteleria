import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * "Estoy guardando" para un botón.
 *
 * Sustituye a `useTransition`, que es lo que había y no era lo que hacía falta:
 * una transición de React marca actualizaciones como no urgentes, y su `isPending`
 * deja de estar activo en cuanto la función llega al primer `await`. Con una
 * escritura de red dentro, el botón volvía a decir "Guardar" mientras la petición
 * seguía en camino, y se podía pulsar dos veces.
 *
 * Un booleano corriente describe exactamente lo que pasa: empieza al lanzar la
 * tarea y termina cuando la tarea termina, salga bien o mal.
 */
export function useOcupado(): readonly [boolean, (tarea: () => Promise<void>) => void] {
  const [ocupado, setOcupado] = useState(false)
  const montado = useRef(true)

  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])

  const ejecutar = useCallback((tarea: () => Promise<void>) => {
    setOcupado(true)
    void tarea().finally(() => {
      // Un diálogo que se cierra al guardar desmonta esto antes de que la
      // promesa termine. Escribir entonces no rompe nada, pero avisa por consola.
      if (montado.current) setOcupado(false)
    })
  }, [])

  return [ocupado, ejecutar] as const
}
