import { Skeleton, SkeletonLista } from '@/components/ui/skeleton'

export default function Cargando() {
  return (
    <div className="container max-w-3xl space-y-4 py-4 md:py-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-9 w-56" />
      <SkeletonLista filas={4} />
    </div>
  )
}
