import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
}

/**
 * Esqueleto de lista. Mientras carga se ve la forma de la lista, no un hueco
 * blanco (regla 4 del BUILD_SPEC).
 */
function SkeletonLista({ filas = 6 }: { filas?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-11 w-28 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export { Skeleton, SkeletonLista }
