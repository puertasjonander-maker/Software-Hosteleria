import { Skeleton, SkeletonLista } from '@/components/ui/skeleton'

export default function Cargando() {
  return (
    <div className="container max-w-4xl space-y-4 py-4 md:py-6">
      <Skeleton className="hidden h-8 w-32 md:block" />
      <Skeleton className="h-28 w-full" />
      <SkeletonLista filas={4} />
    </div>
  )
}
