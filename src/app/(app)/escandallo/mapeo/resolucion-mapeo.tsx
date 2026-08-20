'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, PackagePlus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { EstadoMapeo, MatchIngredientRow, UnidadBase } from '@/lib/database.types'
import { cantidad, plural } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { crearProductoYMapear, mapearLinea } from '../acciones'

export type IngredientePendiente = {
  nombre: string
  estado: EstadoMapeo
  usos: { lineId: string; recetaNombre: string; qty: number; unit: UnidadBase }[]
}

/**
 * Pantalla de resolución de mapeo (MISE-008).
 *
 * Se resuelve por ingrediente y no por línea: "Leche entera" aparece en quince
 * elaboraciones y emparejarlo quince veces sería trabajo inventado. Al elegir
 * producto se mapean de golpe todas sus líneas.
 */
function FichaIngrediente({
  ingrediente,
  proveedores,
  onResuelto,
}: {
  ingrediente: IngredientePendiente
  proveedores: { id: string; nombre: string }[]
  onResuelto: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [busqueda, setBusqueda] = useState(ingrediente.nombre)
  const [candidatos, setCandidatos] = useState<MatchIngredientRow[]>([])
  const [buscando, setBuscando] = useState(false)
  const [guardando, iniciar] = useTransition()
  const [dialogoAbierto, setDialogoAbierto] = useState(false)

  useEffect(() => {
    let cancelado = false
    const temporizador = setTimeout(async () => {
      if (busqueda.trim().length < 2) {
        setCandidatos([])
        return
      }
      setBuscando(true)
      const { data } = await supabase.rpc('match_ingredient', {
        p_name: busqueda.trim(),
        p_limit: 6,
      })
      if (!cancelado) {
        setCandidatos(data ?? [])
        setBuscando(false)
      }
    }, 300)

    return () => {
      cancelado = true
      clearTimeout(temporizador)
    }
  }, [busqueda, supabase])

  function asignar(productId: string) {
    iniciar(async () => {
      // Todas las líneas del mismo ingrediente, de una vez.
      const resultados = await Promise.all(
        ingrediente.usos.map((uso) => mapearLinea(uso.lineId, productId)),
      )
      const fallo = resultados.find((r) => !r.ok)

      if (fallo && !fallo.ok) {
        toast.error('No se ha podido mapear', { description: fallo.mensaje })
        return
      }

      toast.success(`"${ingrediente.nombre}" mapeado`, {
        description: `${plural(ingrediente.usos.length, 'línea actualizada', 'líneas actualizadas')}.`,
      })
      onResuelto()
    })
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{ingrediente.nombre}</p>
            <p className="text-xs text-muted-foreground">
              En {plural(ingrediente.usos.length, 'elaboración', 'elaboraciones')}:{' '}
              {ingrediente.usos
                .slice(0, 3)
                .map((u) => `${u.recetaNombre} (${cantidad(u.qty)} ${u.unit})`)
                .join(', ')}
              {ingrediente.usos.length > 3 ? `, y ${ingrediente.usos.length - 3} más` : ''}
            </p>
          </div>

          <Badge variant={ingrediente.estado === 'ambiguo' ? 'estimado' : 'hueco'}>
            {ingrediente.estado === 'ambiguo' ? 'candidato dudoso' : 'sin candidato'}
          </Badge>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en el catálogo…"
            aria-label={`Buscar producto para ${ingrediente.nombre}`}
            className="pl-9"
          />
        </div>

        {buscando ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
          </p>
        ) : candidatos.length > 0 ? (
          <ul className="space-y-1.5">
            {candidatos.map((c) => (
              <li key={c.product_id}>
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => asignar(c.product_id)}
                  className="flex w-full items-center gap-3 rounded-md border p-2.5 text-left transition-colors duration-rapido ease-estandar hover:bg-accent disabled:opacity-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.product_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.supplier_name} · {c.order_unit} · unidad base {c.base_unit}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {Math.round(c.score * 100)} %
                  </span>
                  <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        ) : busqueda.trim().length >= 2 ? (
          <p className="text-sm text-muted-foreground">
            Ningún producto del catálogo se parece a esto.
          </p>
        ) : null}

        <Button variant="outline" size="sm" onClick={() => setDialogoAbierto(true)}>
          <PackagePlus /> Crear producto para este ingrediente
        </Button>

        <DialogoCrearProducto
          abierto={dialogoAbierto}
          onCerrar={() => setDialogoAbierto(false)}
          nombreSugerido={ingrediente.nombre}
          unidadSugerida={ingrediente.usos[0]?.unit ?? 'ud'}
          proveedores={proveedores}
          lineIds={ingrediente.usos.map((u) => u.lineId)}
          onCreado={onResuelto}
        />
      </CardContent>
    </Card>
  )
}

function DialogoCrearProducto({
  abierto,
  onCerrar,
  nombreSugerido,
  unidadSugerida,
  proveedores,
  lineIds,
  onCreado,
}: {
  abierto: boolean
  onCerrar: () => void
  nombreSugerido: string
  unidadSugerida: UnidadBase
  proveedores: { id: string; nombre: string }[]
  lineIds: string[]
  onCreado: () => void
}) {
  const [nombre, setNombre] = useState(nombreSugerido)
  const [supplierId, setSupplierId] = useState(proveedores[0]?.id ?? '')
  const [categoria, setCategoria] = useState('sin categoría')
  const [unidadPedido, setUnidadPedido] = useState('')
  const [unidadBase, setUnidadBase] = useState<UnidadBase>(unidadSugerida)
  const [factor, setFactor] = useState('1')
  const [precio, setPrecio] = useState('')
  const [guardando, iniciar] = useTransition()

  function crear() {
    if (!supplierId || !nombre.trim() || !unidadPedido.trim()) {
      toast.error('Faltan datos', {
        description: 'Proveedor, nombre y unidad de pedido son obligatorios.',
      })
      return
    }

    iniciar(async () => {
      const factorNumero = Number(factor.replace(',', '.'))
      const precioNumero = precio.trim() === '' ? null : Number(precio.replace(',', '.'))

      const primero = await crearProductoYMapear(lineIds[0], {
        supplierId,
        name: nombre.trim(),
        category: categoria.trim() || 'sin categoría',
        orderUnit: unidadPedido.trim(),
        baseUnit: unidadBase,
        unitsPerOrderUnit: factorNumero > 0 ? factorNumero : 1,
        lastKnownPrice: precioNumero,
      })

      if (!primero.ok) {
        toast.error('No se ha podido crear el producto', { description: primero.mensaje })
        return
      }

      toast.success(`"${nombre}" creado y mapeado`)
      onCerrar()
      onCreado()
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => (v ? null : onCerrar())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear producto</DialogTitle>
          <DialogDescription>
            Se dará de alta en el catálogo de compras y se mapeará este ingrediente. El
            precio que pongas entra como estimado, no como real: solo una recepción produce
            un precio real.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="np-nombre">Nombre</Label>
            <Input id="np-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="np-proveedor">Proveedor</Label>
            <Select
              id="np-proveedor"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="np-categoria">Categoría</Label>
            <Input
              id="np-categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="np-unidad-pedido">Unidad de pedido</Label>
            <Input
              id="np-unidad-pedido"
              placeholder="caja 6 ud, saco 1 kg…"
              value={unidadPedido}
              onChange={(e) => setUnidadPedido(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="np-unidad-base">Unidad base</Label>
            <Select
              id="np-unidad-base"
              value={unidadBase}
              onChange={(e) => setUnidadBase(e.target.value as UnidadBase)}
            >
              <option value="kg">kg</option>
              <option value="l">l</option>
              <option value="ud">ud</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="np-factor">Unidades base por unidad de pedido</Label>
            <Input
              id="np-factor"
              inputMode="decimal"
              value={factor}
              onChange={(e) => setFactor(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Un saco de 5 kg con unidad base kg vale 5. Este factor es la conversión
              explícita entre lo que se compra y lo que consume el escandallo.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="np-precio">Precio por unidad de pedido</Label>
            <Input
              id="np-precio"
              inputMode="decimal"
              placeholder="Opcional"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={crear} disabled={guardando}>
            {guardando ? <Loader2 className="animate-spin" /> : null}
            Crear y mapear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ResolucionMapeo({
  pendientes,
  proveedores,
}: {
  pendientes: IngredientePendiente[]
  proveedores: { id: string; nombre: string }[]
}) {
  const router = useRouter()
  const [resueltos, setResueltos] = useState<Set<string>>(new Set())

  const visibles = pendientes.filter((p) => !resueltos.has(p.nombre))

  if (visibles.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <Check className="h-8 w-8 text-ok" />
          <p className="font-medium">Todo mapeado en esta tanda</p>
          <Button onClick={() => router.refresh()}>Actualizar</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {visibles.map((ingrediente) => (
        <FichaIngrediente
          key={ingrediente.nombre}
          ingrediente={ingrediente}
          proveedores={proveedores}
          onResuelto={() => {
            // Se quita de la lista al vuelo y se refresca en segundo plano: así
            // se pueden encadenar veinte sin esperar a que recargue la página.
            setResueltos((previo) => new Set(previo).add(ingrediente.nombre))
            router.refresh()
          }}
        />
      ))}
    </div>
  )
}
