import { Skeleton, SkeletonLista } from '@/components/ui/skeleton'

export default function CargandoPedir() {
  return (
    <div className="container max-w-2xl space-y-4 py-4">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-11 w-full" />
      <SkeletonLista filas={7} />
    </div>
  )
}
