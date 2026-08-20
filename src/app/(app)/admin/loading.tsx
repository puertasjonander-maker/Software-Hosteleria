import { Skeleton } from '@/components/ui/skeleton'

export default function CargandoAdmin() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-lg border p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  )
}
