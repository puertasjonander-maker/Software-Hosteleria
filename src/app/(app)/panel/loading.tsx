import { Skeleton } from '@/components/ui/skeleton'

export default function CargandoPanel() {
  return (
    <div className="container max-w-5xl space-y-5 py-3 md:py-4" aria-hidden>
      <div className="space-y-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-32" />
          </div>
        ))}
      </div>

      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  )
}
