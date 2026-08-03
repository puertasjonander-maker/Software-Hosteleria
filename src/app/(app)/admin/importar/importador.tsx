'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { COLUMNAS_CATALOGO, interpretarCatalogo, type FilaCatalogo } from '@/lib/catalogo'
import { DIAS_SEMANA } from '@/lib/time'
import { eurosPrecisos, plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { importarCatalogo, type ResumenCatalogo } from './acciones'

/**
 * Importador del catálogo (MISE-000).
 *
 * A diferencia del importador de escandallo, aquí sí se fija el formato de
 * columnas: es una plantilla que damos nosotros, no un Excel que ya existía en
 * la casa. Por eso la pantalla ofrece descargar la plantilla en vez de un mapeo
 * de columnas.
 */
export function ImportadorCatalogo({ locales }: { locales: string[] }) {
  const inputRef = useRef<HTMLInputElement>(null)

  const [nombreFichero, setNombreFichero] = useState<string | null>(null)
  const [filas, setFilas] = useState<Record<string, unknown>[]>([])
  const [faltanColumnas, setFaltanColumnas] = useState<string[]>([])
  const [leyendo, setLeyendo] = useState(false)
  const [resumen, setResumen] = useState<ResumenCatalogo | null>(null)
  const [importando, iniciar] = useTransition()

  async function alElegirFichero(e: React.ChangeEvent<HTMLInputElement>) {
    const fichero = e.target.files?.[0]
    if (!fichero) return

    setLeyendo(true)
    setResumen(null)
    try {
      const XLSX = await import('xlsx')
      const buffer = await fichero.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const datos = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        wb.Sheets[wb.SheetNames[0]],
        { defval: '', raw: true },
      )

      const cabeceras = datos.length > 0 ? Object.keys(datos[0]).map((c) => c.trim()) : []
      const faltan = COLUMNAS_CATALOGO.filter((c) => !cabeceras.includes(c))

      setNombreFichero(fichero.name)
      setFilas(datos)
      setFaltanColumnas(faltan)
    } catch {
      toast.error('No hemos podido leer el fichero', {
        description: 'Tiene que ser un CSV o Excel con la cabecera de la plantilla.',
      })
    } finally {
      setLeyendo(false)
    }
  }

  const interpretacion = useMemo(
    () => (filas.length > 0 && faltanColumnas.length === 0 ? interpretarCatalogo(filas) : null),
    [filas, faltanColumnas],
  )

  const proveedoresDistintos = useMemo(
    () => new Set(interpretacion?.validas.map((f) => f.proveedor) ?? []).size,
    [interpretacion],
  )

  function importar(validas: FilaCatalogo[]) {
    iniciar(async () => {
      const resultado = await importarCatalogo(validas)
      setResumen(resultado)

      if (resultado.ok) toast.success('Catálogo importado')
      else toast.error('La importación ha fallado', { description: resultado.mensaje })
    })
  }

  if (resumen?.ok) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-5 w-5 text-ok" />
            Catálogo importado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-1 text-sm">
            <li>{plural(resumen.proveedores, 'proveedor nuevo', 'proveedores nuevos')}.</li>
            <li>
              {plural(resumen.productos, 'producto creado o actualizado', 'productos creados o actualizados')}
              .
            </li>
            <li>{plural(resumen.pautas, 'pauta de pedido', 'pautas de pedido')} definidas.</li>
            <li>{plural(resumen.asignaciones, 'asignación', 'asignaciones')} a locales.</li>
          </ul>

          {resumen.localesDesconocidos.length > 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Estos nombres de local del CSV no existen y se han ignorado:{' '}
                <strong>{resumen.localesDesconocidos.join(', ')}</strong>. Créalos o corrige el
                fichero y vuelve a importar — reimportar actualiza, no duplica.
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/admin/productos">Ver los productos</Link>
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setResumen(null)
                setFilas([])
                setNombreFichero(null)
                if (inputRef.current) inputRef.current.value = ''
              }}
            >
              Importar otro fichero
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">El fichero</CardTitle>
          <p className="text-sm text-muted-foreground">
            CSV o Excel con estas columnas exactas:{' '}
            <code className="text-xs">{COLUMNAS_CATALOGO.join(', ')}</code>
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            onChange={alElegirFichero}
            className="block w-full text-sm file:mr-3 file:h-10 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-4 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
          />

          {leyendo ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Leyendo…
            </p>
          ) : null}

          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Cómo se rellenan dos columnas:</p>
            <p>
              <strong>dia_pedido</strong> y <strong>dia_entrega</strong>: número de día, con{' '}
              {DIAS_SEMANA.map((d, i) => `${i}=${d}`).join(', ')}.
            </p>
            <p>
              <strong>locales</strong>: <code>todos</code>, o los nombres separados por punto y
              coma. Los locales dados de alta ahora mismo son: {locales.join(', ')}.
            </p>
          </div>

          {faltanColumnas.length > 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Al fichero le faltan columnas: <strong>{faltanColumnas.join(', ')}</strong>.
                Añádelas a la cabecera aunque vayan vacías.
              </span>
            </div>
          ) : null}

          {nombreFichero ? (
            <p className="text-sm">
              {nombreFichero} · {plural(filas.length, 'fila', 'filas')}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {interpretacion ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Previsualización</CardTitle>
            <p className="text-sm text-muted-foreground">
              Todavía no se ha guardado nada. Si un producto ya existe, se actualiza.
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <span>
                <strong>{proveedoresDistintos}</strong>{' '}
                {proveedoresDistintos === 1 ? 'proveedor' : 'proveedores'}
              </span>
              <span>
                <strong>{interpretacion.validas.length}</strong> productos listos
              </span>
              {interpretacion.problemas.length > 0 ? (
                <span className="text-warn">
                  <strong>{interpretacion.problemas.length}</strong> filas con problemas
                </span>
              ) : null}
            </div>

            {interpretacion.problemas.length > 0 ? (
              <details className="rounded-md border" open>
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                  Ver las {interpretacion.problemas.length} filas que no se importarán
                </summary>
                <ul className="max-h-48 overflow-auto border-t px-3 py-2 text-sm">
                  {interpretacion.problemas.map((p) => (
                    <li key={p.fila} className="text-muted-foreground">
                      Fila {p.fila}: {p.motivo}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead>Pauta</TableHead>
                    <TableHead>Locales</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interpretacion.validas.slice(0, 12).map((f, i) => (
                    <TableRow key={i}>
                      <TableCell>{f.proveedor}</TableCell>
                      <TableCell className="font-medium">{f.producto}</TableCell>
                      <TableCell className="text-muted-foreground">{f.categoria}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {f.unidadPedido} ({f.unidadesPorPedido} {f.unidadBase})
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {eurosPrecisos(f.ultimoPrecio)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {f.diaPedido === null || f.horaCorte === null
                          ? '—'
                          : `${DIAS_SEMANA[f.diaPedido]} ${f.horaCorte.slice(0, 5)}`}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {f.locales === null ? 'todos' : f.locales.join(', ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {interpretacion.validas.length > 12 ? (
                <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                  y {interpretacion.validas.length - 12} filas más.
                </p>
              ) : null}
            </div>

            <div className="border-t pt-4">
              <Button
                disabled={interpretacion.validas.length === 0 || importando}
                onClick={() => importar(interpretacion.validas)}
              >
                {importando ? <Loader2 className="animate-spin" /> : <Upload />}
                Importar {interpretacion.validas.length} productos
              </Button>
            </div>

            {resumen && !resumen.ok ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {resumen.mensaje}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
