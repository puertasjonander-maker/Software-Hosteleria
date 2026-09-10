import { Skeleton, SkeletonLista } from '@/components/ui/skeleton'

export default function Cargando() {
  return (
    <div className="container max-w-4xl space-y-4 py-4 md:py-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-9 w-40" />
      <SkeletonLista filas={6} />
    </div>
  )
}
