'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Clock, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { EstadoCorte } from '@/lib/cutoff'
import { duracionRelativa } from '@/lib/time'
import { cantidad as formatearCantidad, plural } from '@/lib/format'
import { confirmar, contarPendientes, encolar, pendientes } from '@/lib/cola-offline'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AvisoSinConexion, EstadoVacio } from '@/components/ui/states'
import { cn } from '@/lib/utils'
import { Stepper } from './stepper'

export type ProductoPedible = {
  id: string
  nombre: string
  categoria: string
  unidadPedido: string
  proveedorId: string
  proveedorNombre: string
  miCantidad: number
  cantidadLocal: number
  corte: {
    estado: EstadoCorte
    minutosHasta: number | null
    etiqueta: string | null
  }
}

/** Un corte a más de 3 h no es información útil mientras se pide: es ruido. */
const MINUTOS_CORTE_RELEVANTE = 180

/**
 * Búsqueda sin tildes: quien escribe con prisa pone "platano" y espera
 * encontrar "Plátano".
 */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function ListaPedir({
  items,
  localId,
  localNombre,
}: {
  items: ProductoPedible[]
  localId: string
  localNombre: string
}) {
  const [busqueda, setBusqueda] = useState('')
  const [soloPedidos, setSoloPedidos] = useState(false)
  const [enLinea, setEnLinea] = useState(true)
  const [porSincronizar, setPorSincronizar] = useState(0)

  // El estado local manda mientras la pantalla está abierta: la confirmación es
  // visual e inmediata, sin esperar al servidor (MISE-001, criterio de confianza).
  const [mias, setMias] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.miCantidad])),
  )
  const [otras] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.cantidadLocal - i.miCantidad])),
  )

  const temporizadores = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const supabase = useMemo(() => createClient(), [])

  const sincronizar = useCallback(async () => {
    const cola = pendientes()
    if (cola.length === 0) {
      setPorSincronizar(0)
      return
    }

    let fallo = false
    for (const entrada of cola) {
      const { error } = await supabase.rpc('set_request_qty', {
        p_product_id: entrada.productId,
        p_qty: entrada.qty,
        p_location_id: entrada.locationId,
        p_note: entrada.note,
      })

      if (error) {
        fallo = true
        break // Sin red no tiene sentido intentar las 20 siguientes.
      }
      confirmar(entrada)
    }

    setPorSincronizar(contarPendientes())
    if (!fallo) setEnLinea(true)
  }, [supabase])

  // Reintento al recuperar red y al volver a la pestaña: son los dos momentos en
  // que un móvil que estuvo en el sótano vuelve a tener cobertura.
  useEffect(() => {
    setEnLinea(navigator.onLine)
    setPorSincronizar(contarPendientes())

    const alConectar = () => {
      setEnLinea(true)
      void sincronizar()
    }
    const alDesconectar = () => setEnLinea(false)
    const alVolver = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void sincronizar()
    }

    window.addEventListener('online', alConectar)
    window.addEventListener('offline', alDesconectar)
    document.addEventListener('visibilitychange', alVolver)

    void sincronizar()

    return () => {
      window.removeEventListener('online', alConectar)
      window.removeEventListener('offline', alDesconectar)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [sincronizar])

  useEffect(() => {
    const pendientesRef = temporizadores.current
    return () => {
      Object.values(pendientesRef).forEach(clearTimeout)
    }
  }, [])

  const cambiar = useCallback(
    (item: ProductoPedible, nuevo: number) => {
      setMias((previo) => ({ ...previo, [item.id]: nuevo }))
      setPorSincronizar(encolar({ productId: item.id, locationId: localId, qty: nuevo, note: null }))

      // Un toque rápido de "+++" son tres pulsaciones, no tres peticiones.
      clearTimeout(temporizadores.current[item.id])
      temporizadores.current[item.id] = setTimeout(() => {
        void sincronizar().catch(() => {
          setEnLinea(false)
          toast.warning('Sin conexión', {
            description: 'Lo registrado se enviará solo al recuperar red.',
          })
        })
      }, 500)
    },
    [localId, sincronizar],
  )

  const filtrados = useMemo(() => {
    const consulta = normalizar(busqueda.trim())
    // El filtro entra a partir de 2 caracteres (MISE-001): con 1 no discrimina
    // nada y la lista pega un salto por cada tecla.
    const aplicaBusqueda = consulta.length >= 2

    return items.filter((i) => {
      if (soloPedidos && (mias[i.id] ?? 0) === 0) return false
      if (!aplicaBusqueda) return true
      return (
        normalizar(i.nombre).includes(consulta) || normalizar(i.proveedorNombre).includes(consulta)
      )
    })
  }, [items, busqueda, soloPedidos, mias])

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, ProductoPedible[]>()
    for (const item of filtrados) {
      const lista = mapa.get(item.categoria) ?? []
      lista.push(item)
      mapa.set(item.categoria, lista)
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'))
  }, [filtrados])

  const totalPedidoHoy = useMemo(
    () => Object.values(mias).filter((q) => q > 0).length,
    [mias],
  )

  const corteMasCercano = useMemo(() => {
    const conPedido = items.filter((i) => (mias[i.id] ?? 0) > 0)
    const candidatos = (conPedido.length > 0 ? conPedido : items)
      .filter((i) => i.corte.minutosHasta !== null)
      .sort((a, b) => (a.corte.minutosHasta ?? 0) - (b.corte.minutosHasta ?? 0))
    return candidatos[0] ?? null
  }, [items, mias])

  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-20 -mx-4 space-y-3 border-b bg-background/95 px-4 pb-3 pt-1 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            inputMode="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto…"
            aria-label="Buscar producto"
            className="pl-9 pr-9"
          />
          {busqueda ? (
            <button
              type="button"
              onClick={() => setBusqueda('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={soloPedidos ? 'default' : 'outline'}
            onClick={() => setSoloPedidos((v) => !v)}
          >
            <Check /> Lo que llevo hoy
            {totalPedidoHoy > 0 ? ` (${totalPedidoHoy})` : ''}
          </Button>

          {corteMasCercano?.corte.etiqueta ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
                corteMasCercano.corte.estado === 'vencido'
                  ? 'bg-destructive/10 text-destructive'
                  : corteMasCercano.corte.estado === 'proximo'
                    ? 'bg-warn/15 text-warn'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              {corteMasCercano.proveedorNombre}:{' '}
              {corteMasCercano.corte.estado === 'vencido'
                ? 'corte pasado'
                : `corte ${duracionRelativa(corteMasCercano.corte.minutosHasta ?? 0)}`}
            </span>
          ) : null}
        </div>

        {!enLinea || porSincronizar > 0 ? (
          <AvisoSinConexion pendientes={porSincronizar} />
        ) : null}
      </div>

      {porCategoria.length === 0 ? (
        busqueda.trim().length >= 2 ? (
          <EstadoVacio
            titulo={`Ningún producto coincide con "${busqueda.trim()}"`}
            descripcion="Prueba con otra palabra. Si el producto no está en el catálogo, díselo al encargado."
            icono={Search}
          />
        ) : (
          <EstadoVacio
            titulo="Aún no has pedido nada hoy"
            descripcion={`Quita el filtro para ver todo el catálogo de ${localNombre}.`}
            accion={
              <Button variant="outline" onClick={() => setSoloPedidos(false)}>
                Ver todo el catálogo
              </Button>
            }
          />
        )
      ) : (
        porCategoria.map(([categoria, productos]) => (
          <section key={categoria} className="space-y-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {categoria}
            </h2>

            <ul className="space-y-2">
              {productos.map((item) => {
                const mia = mias[item.id] ?? 0
                const deOtros = otras[item.id] ?? 0
                const corteRelevante =
                  item.corte.estado === 'vencido' ||
                  (item.corte.minutosHasta !== null &&
                    item.corte.minutosHasta <= MINUTOS_CORTE_RELEVANTE)

                return (
                  <li
                    key={item.id}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border p-3 transition-colors',
                      mia > 0 && 'border-primary/30 bg-primary/[0.03]',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium leading-tight">{item.nombre}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.unidadPedido} · {item.proveedorNombre}
                      </p>

                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {deOtros > 0 ? (
                          <Badge variant="secondary" className="text-[11px]">
                            {formatearCantidad(mia + deOtros)} en el local
                          </Badge>
                        ) : null}

                        {corteRelevante ? (
                          <span
                            className={cn(
                              'text-[11px] font-medium',
                              item.corte.estado === 'vencido' ? 'text-destructive' : 'text-warn',
                            )}
                          >
                            {item.corte.estado === 'vencido'
                              ? 'Corte de hoy ya pasado'
                              : `Corte ${duracionRelativa(item.corte.minutosHasta ?? 0)}`}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <Stepper
                      valor={mia}
                      onCambio={(nuevo) => cambiar(item, nuevo)}
                      etiquetaProducto={item.nombre}
                    />
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}

      {totalPedidoHoy > 0 ? (
        <p className="pt-2 text-center text-sm text-muted-foreground">
          Llevas {plural(totalPedidoHoy, 'producto pedido', 'productos pedidos')} hoy en{' '}
          {localNombre}.
        </p>
      ) : null}
    </div>
  )
}
