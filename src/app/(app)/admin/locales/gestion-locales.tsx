'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EstadoVacio } from '@/components/ui/states'
import { guardarLocal } from '../acciones'

type Local = { id: string; nombre: string; activo: boolean; productos: number }

export function GestionLocales({ locales }: { locales: Local[] }) {
  const router = useRouter()
  const [nuevo, setNuevo] = useState('')
  const [guardando, iniciar] = useTransition()

  function crear() {
    if (!nuevo.trim()) return
    iniciar(async () => {
      const resultado = await guardarLocal(null, nuevo.trim(), true)
      if (resultado.ok) {
        setNuevo('')
        toast.success('Local creado')
        router.refresh()
      } else {
        toast.error(resultado.mensaje)
      }
    })
  }

  function alternar(local: Local) {
    iniciar(async () => {
      const resultado = await guardarLocal(local.id, local.nombre, !local.activo)
      if (resultado.ok) router.refresh()
      else toast.error(resultado.mensaje)
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="min-w-[16rem] flex-1 space-y-1.5">
            <Label htmlFor="nuevo-local">Nombre del local</Label>
            <Input
              id="nuevo-local"
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') crear()
              }}
              placeholder="Local Centro"
            />
          </div>
          <Button onClick={crear} disabled={!nuevo.trim() || guardando}>
            {guardando ? <Loader2 className="animate-spin" /> : <Plus />}
            Añadir local
          </Button>
        </CardContent>
      </Card>

      {locales.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay locales"
          descripcion="Crea uno por cada sitio con barra. Cada usuario pertenece a un local y las solicitudes se agrupan por él."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Local</TableHead>
                <TableHead className="text-right">Productos asignados</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {locales.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.nombre}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.productos}</TableCell>
                  <TableCell>
                    {l.activo ? (
                      <Badge variant="real">activo</Badge>
                    ) : (
                      <Badge variant="hueco">inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {/* Se desactiva, no se borra: un local con histórico de
                        pedidos no puede desaparecer sin llevarse los datos. */}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={guardando}
                      onClick={() => alternar(l)}
                    >
                      {l.activo ? 'Desactivar' : 'Reactivar'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
