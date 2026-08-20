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

  /*
   * El escalonado de entrada es solo para la primera pintura. Filtrar tiene que
   * ser instantáneo: animar la lista en cada tecla del buscador no se siente
   * fino, se siente lento. Es una ref porque no queremos re-pintar al apagarlo.
   */
  const primeraPintura = useRef(true)
  useEffect(() => {
    primeraPintura.current = false
  }, [])

  const escalonar = primeraPintura.current
  let indiceFila = 0

  const urgente =
    corteMasCercano?.corte.etiqueta &&
    (corteMasCercano.corte.estado === 'vencido' || corteMasCercano.corte.estado === 'proximo')
      ? corteMasCercano
      : null

  return (
    <div className="space-y-3">
      <div className="sticky top-14 z-20 -mx-4 border-b bg-background/95 px-4 backdrop-blur">
        {/*
         * El corte que aprieta es una condición de toda la pantalla, no un
         * filtro más. Antes era una píldora al lado del botón de filtrar, donde
         * parecía algo que se pulsa; aquí es una franja de 28 px que solo
         * aparece cuando queda poco.
         */}
        {urgente ? (
          <div
            role="status"
            className={cn(
              '-mx-4 flex h-7 items-center gap-1.5 px-4 text-xs font-medium',
              urgente.corte.estado === 'vencido'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-warn/[0.12] text-warn',
            )}
          >
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {urgente.corte.estado === 'vencido'
                ? `${urgente.proveedorNombre}: corte de hoy ya pasado`
                : `${urgente.proveedorNombre} cierra ${duracionRelativa(urgente.corte.minutosHasta ?? 0)}`}
            </span>
          </div>
        ) : null}

        <div className="space-y-2 pb-2.5 pt-2">
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
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors duration-rapido ease-estandar hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              variant={soloPedidos ? 'default' : 'outline'}
              className="rounded-full"
              onClick={() => setSoloPedidos((v) => !v)}
            >
              <Check /> Lo que llevo hoy
              {totalPedidoHoy > 0 ? (
                <span className="tabular-nums opacity-75">{totalPedidoHoy}</span>
              ) : null}
            </Button>

            <span className="shrink-0 text-micro font-medium text-muted-foreground">
              {plural(items.length, 'producto', 'productos')}
            </span>
          </div>

          {!enLinea || porSincronizar > 0 ? (
            <AvisoSinConexion pendientes={porSincronizar} />
          ) : null}
        </div>
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
          <section key={categoria} className="space-y-1.5">
            <h2 className="titulo-seccion px-1">{categoria}</h2>

            <ul className="space-y-1.5">
              {productos.map((item) => {
                const mia = mias[item.id] ?? 0
                const deOtros = otras[item.id] ?? 0
                const corteRelevante =
                  item.corte.estado === 'vencido' ||
                  (item.corte.minutosHasta !== null &&
                    item.corte.minutosHasta <= MINUTOS_CORTE_RELEVANTE)

                // Tope de 8 filas escalonadas: 24 ms × 8 + 200 ms son 390 ms de
                // principio a fin. Escalonar cuarenta serían casi dos segundos.
                const retardo = Math.min(indiceFila++, 7) * 24

                return (
                  <li
                    key={item.id}
                    className={cn(
                      // El raíl del canto dice "esto lo llevas" bajando la lista
                      // sin leer. La fila mide 3 px más y no da saltos al
                      // pedir, porque el borde existe siempre.
                      'flex items-center gap-3 rounded-lg border border-l-[3px] p-2.5 pl-3',
                      'transition-colors duration-base ease-salida',
                      mia > 0
                        ? 'border-border border-l-primary bg-primary/[0.04]'
                        : 'border-l-transparent',
                      escalonar && 'animate-entrada-fila',
                    )}
                    style={escalonar ? { animationDelay: `${retardo}ms` } : undefined}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-cuerpo font-semibold leading-5">{item.nombre}</p>

                      <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                        {/*
                         * La unidad no se negocia: sin ella, "6" no significa
                         * nada. El proveedor sí — solo aparece cuando la línea
                         * está libre. Con la etiqueta puesta no cabían los dos
                         * y se truncaba justo el nombre del proveedor, que es
                         * el trozo que hay que leer entero o no leer.
                         */}
                        <span className="truncate text-meta text-muted-foreground">
                          {item.unidadPedido}
                          {corteRelevante || deOtros > 0 ? '' : ` · ${item.proveedorNombre}`}
                        </span>

                        {/* Lo que aprieta gana el sitio: si hay corte cerca, el
                            recuento del local puede esperar a la siguiente
                            mirada. Nunca las dos cosas, para no meter una
                            tercera línea en una fila de 68 px. */}
                        {corteRelevante ? (
                          <span
                            className={cn(
                              'shrink-0 text-micro font-semibold',
                              item.corte.estado === 'vencido' ? 'text-destructive' : 'text-warn',
                            )}
                          >
                            {item.corte.estado === 'vencido'
                              ? 'corte pasado'
                              : `corte ${duracionRelativa(item.corte.minutosHasta ?? 0)}`}
                          </span>
                        ) : deOtros > 0 ? (
                          <Badge variant="secondary" className="shrink-0 text-micro tabular-nums">
                            {formatearCantidad(mia + deOtros)} en el local
                          </Badge>
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
        <p className="pt-1 text-center text-meta text-muted-foreground">
          Llevas {plural(totalPedidoHoy, 'producto pedido', 'productos pedidos')} hoy en{' '}
          {localNombre}.
        </p>
      ) : null}
    </div>
  )
}
