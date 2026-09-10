import { Suspense } from 'react'
import type { Metadata } from 'next'
import { FormularioAcceso } from './formulario-acceso'
import { Skeleton } from '@/components/ui/skeleton'

export const metadata: Metadata = { title: 'Entrar' }

export default function PaginaLogin() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-8">
        <header className="space-y-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">
            E
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Ergobox</h1>
          <p className="text-sm text-muted-foreground">
            Mantenimiento de máquinas. Entra con el correo con el que te dimos de alta.
          </p>
        </header>

        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <FormularioAcceso />
        </Suspense>
      </div>
    </main>
  )
}
