'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { UnidadBase } from '@/lib/database.types'
import { eurosPrecisos, plural } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EstadoVacio } from '@/components/ui/states'
import { asignarProductosALocal, guardarProducto } from '../acciones'

export type ProductoVista = {
  id: string
  supplierId: string
  nombre: string
  categoria: string
  unidadPedido: string
  unidadBase: UnidadBase
  unidadesPorPedido: number
  ultimoPrecio: number | null
  activo: boolean
  locales: string[]
}

type Referencia = { id: string; nombre: string }

function DialogoProducto({
  producto,
  proveedores,
  abierto,
  onCerrar,
}: {
  producto: ProductoVista | null
  proveedores: Referencia[]
  abierto: boolean
  onCerrar: () => void
}) {
  const router = useRouter()
  const [supplierId, setSupplierId] = useState(producto?.supplierId ?? proveedores[0]?.id ?? '')
  const [nombre, setNombre] = useState(producto?.nombre ?? '')
  const [categoria, setCategoria] = useState(producto?.categoria ?? 'sin categoría')
  const [unidadPedido, setUnidadPedido] = useState(producto?.unidadPedido ?? '')
  const [unidadBase, setUnidadBase] = useState<UnidadBase>(producto?.unidadBase ?? 'ud')
  const [factor, setFactor] = useState(String(producto?.unidadesPorPedido ?? 1))
  const [precio, setPrecio] = useState(
    producto?.ultimoPrecio === null || producto?.ultimoPrecio === undefined
      ? ''
      : String(producto.ultimoPrecio),
  )
  const [activo, setActivo] = useState(producto?.activo ?? true)
  const [guardando, iniciar] = useTransition()

  function guardar() {
    if (!nombre.trim() || !unidadPedido.trim() || !supplierId) {
      toast.error('Faltan datos', {
        description: 'Proveedor, nombre y unidad de pedido son obligatorios.',
      })
      return
    }

    const factorNumero = Number(factor.replace(',', '.'))
    if (!Number.isFinite(factorNumero) || factorNumero <= 0) {
      toast.error('El factor de conversión tiene que ser mayor que cero')
      return
    }

    iniciar(async () => {
      const resultado = await guardarProducto(producto?.id ?? null, {
        supplierId,
        nombre: nombre.trim(),
        categoria: categoria.trim() || 'sin categoría',
        unidadPedido: unidadPedido.trim(),
        unidadBase,
        unidadesPorPedido: factorNumero,
        ultimoPrecio: precio.trim() === '' ? null : Number(precio.replace(',', '.')),
        activo,
      })

      if (resultado.ok) {
        toast.success(producto ? 'Producto actualizado' : 'Producto creado')
        onCerrar()
        router.refresh()
      } else {
        toast.error(resultado.mensaje)
      }
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => (v ? null : onCerrar())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{producto ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
          <DialogDescription>
            La unidad de pedido es como se compra (&laquo;caja 6 ud&raquo;); la unidad base
            es como la consume el escandallo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pr-nombre">Nombre</Label>
            <Input id="pr-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pr-proveedor">Proveedor</Label>
            <Select
              id="pr-proveedor"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              {proveedores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pr-categoria">Categoría</Label>
            <Input
              id="pr-categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="café, lácteos, panadería…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pr-unidad-pedido">Unidad de pedido</Label>
            <Input
              id="pr-unidad-pedido"
              value={unidadPedido}
              onChange={(e) => setUnidadPedido(e.target.value)}
              placeholder="caja 6 ud"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pr-unidad-base">Unidad base</Label>
            <Select
              id="pr-unidad-base"
              value={unidadBase}
              onChange={(e) => setUnidadBase(e.target.value as UnidadBase)}
            >
              <option value="kg">kg</option>
              <option value="l">l</option>
              <option value="ud">ud</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pr-factor">Unidades base por unidad de pedido</Label>
            <Input
              id="pr-factor"
              inputMode="decimal"
              value={factor}
              onChange={(e) => setFactor(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pr-precio">Último precio conocido</Label>
            <Input
              id="pr-precio"
              inputMode="decimal"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              placeholder="Opcional"
            />
            <p className="text-xs text-muted-foreground">
              Solo alimenta la estimación de importe. El precio real lo fija la recepción.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              className="h-4 w-4"
            />
            Producto activo
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? <Loader2 className="animate-spin" /> : null}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function GestionProductos({
  productos,
  proveedores,
  locales,
}: {
  productos: ProductoVista[]
  proveedores: Referencia[]
  locales: Referencia[]
}) {
  const router = useRouter()
  const [busqueda, setBusqueda] = useState('')
  const [filtroProveedor, setFiltroProveedor] = useState('')
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [editando, setEditando] = useState<ProductoVista | null>(null)
  const [creando, setCreando] = useState(false)
  const [asignando, iniciarAsignacion] = useTransition()

  const nombreProveedor = useMemo(
    () => new Map(proveedores.map((s) => [s.id, s.nombre])),
    [proveedores],
  )
  const nombreLocal = useMemo(() => new Map(locales.map((l) => [l.id, l.nombre])), [locales])

  const filtrados = useMemo(() => {
    const consulta = busqueda.trim().toLowerCase()
    return productos.filter((p) => {
      if (filtroProveedor && p.supplierId !== filtroProveedor) return false
      if (!consulta) return true
      return (
        p.nombre.toLowerCase().includes(consulta) || p.categoria.toLowerCase().includes(consulta)
      )
    })
  }, [productos, busqueda, filtroProveedor])

  const todosSeleccionados = filtrados.length > 0 && filtrados.every((p) => seleccion.has(p.id))

  function alternarSeleccion(id: string) {
    setSeleccion((previo) => {
      const nueva = new Set(previo)
      if (nueva.has(id)) nueva.delete(id)
      else nueva.add(id)
      return nueva
    })
  }

  function asignar(locationId: string, asignarloS: boolean) {
    const ids = [...seleccion]
    if (ids.length === 0) return

    iniciarAsignacion(async () => {
      const resultado = await asignarProductosALocal(locationId, ids, asignarloS)
      if (resultado.ok) {
        toast.success(
          `${plural(ids.length, 'producto', 'productos')} ${
            asignarloS ? 'asignados a' : 'retirados de'
          } ${nombreLocal.get(locationId)}`,
        )
        setSeleccion(new Set())
        router.refresh()
      } else {
        toast.error(resultado.mensaje)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto o categoría…"
            className="pl-9"
            aria-label="Buscar producto"
          />
        </div>

        <Select
          value={filtroProveedor}
          onChange={(e) => setFiltroProveedor(e.target.value)}
          className="max-w-[14rem]"
          aria-label="Filtrar por proveedor"
        >
          <option value="">Todos los proveedores</option>
          {proveedores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </Select>

        <Button onClick={() => setCreando(true)}>
          <Plus /> Nuevo producto
        </Button>
      </div>

      {/* Alta y baja masiva: sin esto, asignar 200 productos a tres locales sería
          600 clics y nadie lo haría (MISE-000). */}
      {seleccion.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-secondary/50 p-3 text-sm">
          <span className="font-medium">
            {plural(seleccion.size, 'producto seleccionado', 'productos seleccionados')}
          </span>
          <span className="text-muted-foreground">·</span>
          {locales.map((l) => (
            <span key={l.id} className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={asignando}
                onClick={() => asignar(l.id, true)}
              >
                {asignando ? <Loader2 className="animate-spin" /> : null}
                Añadir a {l.nombre}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={asignando}
                onClick={() => asignar(l.id, false)}
              >
                Quitar
              </Button>
            </span>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setSeleccion(new Set())}>
            Deseleccionar
          </Button>
        </div>
      ) : null}

      {filtrados.length === 0 ? (
        <EstadoVacio
          titulo={
            productos.length === 0
              ? 'Todavía no hay productos'
              : 'Ningún producto coincide con el filtro'
          }
          descripcion={
            productos.length === 0
              ? 'Cárgalos desde el CSV del catálogo o créalos uno a uno.'
              : 'Prueba con otra palabra o quita el filtro de proveedor.'
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos"
                    checked={todosSeleccionados}
                    onChange={(e) =>
                      setSeleccion(
                        e.target.checked ? new Set(filtrados.map((p) => p.id)) : new Set(),
                      )
                    }
                    className="h-4 w-4"
                  />
                </TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Unidad de pedido</TableHead>
                <TableHead className="text-right">Últ. precio</TableHead>
                <TableHead>Locales</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((p) => (
                <TableRow key={p.id} data-state={seleccion.has(p.id) ? 'selected' : undefined}>
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${p.nombre}`}
                      checked={seleccion.has(p.id)}
                      onChange={() => alternarSeleccion(p.id)}
                      className="h-4 w-4"
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {p.nombre}
                    {!p.activo ? (
                      <Badge variant="hueco" className="ml-2">
                        inactivo
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {nombreProveedor.get(p.supplierId) ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.categoria}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.unidadPedido}
                    <span className="ml-1 text-xs">
                      ({p.unidadesPorPedido} {p.unidadBase})
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {eurosPrecisos(p.ultimoPrecio)}
                  </TableCell>
                  <TableCell>
                    {p.locales.length === 0 ? (
                      <Badge variant="estimado">sin asignar</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {p.locales.map((id) => nombreLocal.get(id) ?? '?').join(', ')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Editar ${p.nombre}`}
                      onClick={() => setEditando(p)}
                    >
                      <Pencil />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {creando ? (
        <DialogoProducto
          producto={null}
          proveedores={proveedores}
          abierto
          onCerrar={() => setCreando(false)}
        />
      ) : null}

      {editando ? (
        <DialogoProducto
          key={editando.id}
          producto={editando}
          proveedores={proveedores}
          abierto
          onCerrar={() => setEditando(null)}
        />
      ) : null}
    </div>
  )
}
