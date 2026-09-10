import { Skeleton, SkeletonLista } from '@/components/ui/skeleton'

export default function Cargando() {
  return (
    <div className="container max-w-3xl space-y-4 py-4 md:py-6">
      <Skeleton className="hidden h-8 w-32 md:block" />
      <Skeleton className="h-11 w-44" />
      <SkeletonLista filas={3} />
    </div>
  )
}
