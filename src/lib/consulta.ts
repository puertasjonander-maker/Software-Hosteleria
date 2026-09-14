import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Pedir datos y saber en qué punto va la petición.
 *
 * Cincuenta líneas en vez de una librería de caché a propósito. Esta aplicación
 * tiene siete pantallas y ninguna consulta se repite entre ellas: lo que aporta
 * una caché compartida aquí es una capa más que entender cuando algo enseñe un
 * dato viejo.
 *
 * Lo que sí resuelve, porque son fallos de verdad y no teoría:
 *   · No escribe en un componente ya desmontado.
 *   · Si llegan dos respuestas desordenadas, gana la última que se pidió y no la
 *     última que llegó. Pasa al teclear en un filtro.
 *   · `recargar()` para después de escribir, que es como se refresca una lista.
 */

export type Consulta<T> = {
  datos: T | null
  cargando: boolean
  /** Mensaje ya legible. Null si fue bien. */
  error: string | null
  recargar: () => void
}

export function useConsulta<T>(cargar: () => Promise<T>, dependencias: unknown[]): Consulta<T> {
  const [datos, setDatos] = useState<T | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // El contador identifica cada petición. Solo la más reciente puede escribir.
  const peticion = useRef(0)
  const montado = useRef(true)

  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])

  // `cargar` es casi siempre una función anónima nueva en cada render, así que
  // no puede ir en las dependencias: quien decide cuándo se repite la consulta
  // es la lista que pasa la pantalla.
  const cargarRef = useRef(cargar)
  cargarRef.current = cargar

  const ejecutar = useCallback(() => {
    const mia = ++peticion.current
    setCargando(true)
    setError(null)

    cargarRef
      .current()
      .then((resultado) => {
        if (!montado.current || peticion.current !== mia) return
        setDatos(resultado)
      })
      .catch((e: unknown) => {
        if (!montado.current || peticion.current !== mia) return
        setError(e instanceof Error ? e.message : 'No hemos podido cargar esto.')
      })
      .finally(() => {
        if (!montado.current || peticion.current !== mia) return
        setCargando(false)
      })
  }, [])

  useEffect(() => {
    ejecutar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencias)

  return { datos, cargando, error, recargar: ejecutar }
}
