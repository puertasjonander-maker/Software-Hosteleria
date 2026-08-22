import { Skeleton } from '@/components/ui/skeleton'

/**
 * Mientras carga se ve la forma de la bandeja, no un hueco blanco (regla 4 del
 * BUILD_SPEC). Hasta ahora solo `/pedir` tenía esqueleto: en el resto, cambiar
 * de pantalla dejaba la anterior congelada hasta que llegaban los datos.
 */
export default function CargandoPedidos() {
  return (
    <div className="container max-w-3xl space-y-6 py-3 md:py-4" aria-hidden>
      <div className="hidden space-y-2 md:block">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="space-y-2.5">
        <Skeleton className="h-4 w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2.5 rounded-lg border border-l-[3px] p-3.5">
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className="h-5 w-20" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-11 w-36 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
