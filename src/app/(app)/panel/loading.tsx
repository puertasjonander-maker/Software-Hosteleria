import { Skeleton, SkeletonLista } from '@/components/ui/skeleton'

export default function Cargando() {
  return (
    <div className="container max-w-5xl space-y-5 py-4 md:py-6">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-56" />
      </div>
      <Skeleton className="h-14 w-full" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <SkeletonLista filas={5} />
    </div>
  )
}
