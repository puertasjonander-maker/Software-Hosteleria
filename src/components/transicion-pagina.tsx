'use client'

import { usePathname } from 'next/navigation'

/**
 * Fundido de entrada al cambiar de pantalla.
 *
 * La `key` es la ruta: al navegar, React desmonta y vuelve a montar, así que la
 * animación se reproduce otra vez. Sin la `key` solo se vería la primera carga.
 *
 * 200 ms y 8 px. No más: el contenido tiene que estar legible antes de que a
 * nadie le dé tiempo a notar que ha habido una transición. La animación usa
 * `backwards`, así que al terminar no deja un `transform` puesto — un ancestro
 * transformado convierte cualquier `position: fixed` de dentro en absoluto.
 */
export function TransicionPagina({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div key={pathname} className="animate-entrada-pagina">
      {children}
    </div>
  )
}
