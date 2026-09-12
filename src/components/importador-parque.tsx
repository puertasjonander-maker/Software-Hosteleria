import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Download, Loader2, Upload } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  COLUMNAS_PARQUE,
  COLUMNAS_PARQUE_OBLIGATORIAS,
  interpretarParque,
  leerFicheroParque,
  plantillaParqueCsv,
  type FilaParque,
} from '@/lib/parque'
import { useOcupado } from '@/lib/ocupado'
import { ETIQUETA_SEMAFORO, ETIQUETA_TIPO_MAQUINA } from '@/lib/roles'
import { plural } from '@/lib/format'
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
import { importarParque, leerParqueDeNotion, type ResumenImportacion } from '@/datos/parque'

/**
 * Importador del parque de un box (EBX-103).
 *
 * El formato de columnas es fijo porque la plantilla la damos nosotros. Por eso
 * la pantalla ofrece descargarla en vez de un mapeo de columnas: no hay un Excel
 * previo de la casa al que adaptarse.
 *
 * Nada se escribe hasta que la persona ve qué va a entrar y qué se queda fuera.
 */
export function ImportadorParque({
  clienteId,
  clienteNombre,
  maquinasActuales,
}: {
  clienteId: string
  clienteNombre: string
  maquinasActuales: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const [nombreFichero, setNombreFichero] = useState<string | null>(null)
  const [filas, setFilas] = useState<Record<string, unknown>[]>([])
  const [faltanColumnas, setFaltanColumnas] = useState<string[]>([])
  const [leyendo, setLeyendo] = useState(false)
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null)
  const [importando, iniciar] = useOcupado()

  const [baseNotion, setBaseNotion] = useState('')
  const [leyendoNotion, setLeyendoNotion] = useState(false)

  async function alElegirFichero(e: React.ChangeEvent<HTMLInputElement>) {
    const fichero = e.target.files?.[0]
    if (!fichero) return

    setLeyendo(true)
    setResumen(null)
    try {
      const datos = await leerFicheroParque(fichero)
      const cabeceras = datos.length > 0 ? Object.keys(datos[0]).map((c) => c.trim()) : []
      const faltan = COLUMNAS_PARQUE_OBLIGATORIAS.filter((c) => !cabeceras.includes(c))

      setNombreFichero(fichero.name)
      setFilas(datos)
      setFaltanColumnas(faltan)
    } catch {
      toast.error('No hemos podido leer el fichero', {
        description: 'Tiene que ser un CSV o un Excel con una fila por máquina.',
      })
    } finally {
      setLeyendo(false)
    }
  }

  /**
   * Trae las filas de Notion y las mete por el mismo sitio que un fichero.
   *
   * `setFilas` es la misma que usa el CSV, así que a partir de aquí todo es
   * idéntico: el mismo previsualizador, los mismos motivos fila a fila y el
   * mismo botón de importar. Lo de Notion se acaba en esta función.
   */
  async function traerDeNotion() {
    if (baseNotion.trim() === '') return

    setLeyendoNotion(true)
    setResumen(null)
    try {
      const r = await leerParqueDeNotion(baseNotion)

      if (!r.ok) {
        toast.error(
          r.sinConfigurar ? 'Notion no está conectado todavía' : 'No hemos podido leer Notion',
          { description: r.mensaje },
        )
        return
      }

      if (r.filas.length === 0) {
        toast.error('Esa base de Notion no tiene ninguna máquina con nombre')
        return
      }

      setNombreFichero(`Notion · ${plural(r.filas.length, 'máquina', 'máquinas')}`)
      setFilas(r.filas)
      setFaltanColumnas([])
    } finally {
      setLeyendoNotion(false)
    }
  }

  function descargarPlantilla() {
    const blob = new Blob([plantillaParqueCsv()], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'plantilla-parque.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const interpretacion = useMemo(
    () => (filas.length > 0 && faltanColumnas.length === 0 ? interpretarParque(filas) : null),
    [filas, faltanColumnas],
  )

  function importar(validas: FilaParque[]) {
    iniciar(async () => {
      const r = await importarParque(clienteId, validas)
      setResumen(r)
      if (r.ok) toast.success('Parque importado')
      else toast.error('La importación ha fallado', { description: r.mensaje })
    })
  }

  if (resumen?.ok) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 shrink-0 text-ok" />
            <div>
              <p className="titulo-tarjeta">Parque importado</p>
              <p className="texto-meta">
                {plural(resumen.creadas, 'máquina nueva', 'máquinas nuevas')}
                {resumen.actualizadas > 0
                  ? ` y ${plural(resumen.actualizadas, 'actualizada', 'actualizadas')}`
                  : ''}
                .
              </p>
            </div>
          </div>
          <Button asChild>
            <Link to={`/boxes/${clienteId}`}>Ver el parque de {clienteNombre}</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="titulo-tarjeta">Desde un fichero…</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="texto-meta">
            Una fila por máquina. Solo <code className="font-mono">nombre</code> es obligatorio: en
            una primera visita se apunta lo que se ve, y la mitad de los números de serie están
            borrados o detrás de la máquina.
          </p>
          <p className="texto-meta">
            Columnas que se leen: {COLUMNAS_PARQUE.join(', ')}.
          </p>

          {/* El camino corto de verdad para el parque que ya está en Notion: dos
              clics allí y soltar el fichero aquí, sin dar de alta nada. */}
          <div className="rounded-lg border border-dashed bg-muted/30 p-3">
            <p className="text-meta font-semibold">¿El parque está en Notion?</p>
            <p className="mt-1 texto-meta">
              Exporta la base desde Notion —menú de los tres puntos, <em>Exportar</em>, formato
              CSV— y suelta ese fichero aquí. Se entienden sus columnas tal cual:{' '}
              <span className="font-mono">Máquina</span>,{' '}
              <span className="font-mono">Tipo</span>,{' '}
              <span className="font-mono">Nº serie</span>,{' '}
              <span className="font-mono">Estado</span> y{' '}
              <span className="font-mono">Fecha de servicio</span>. «Servicio hecho» entra como
              correcta y «Por revisar» como sin revisar.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={descargarPlantilla}>
              <Download /> Descargar plantilla
            </Button>
            <Button type="button" onClick={() => inputRef.current?.click()} disabled={leyendo}>
              {leyendo ? <Loader2 className="animate-spin" /> : <Upload />}
              Elegir fichero
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="sr-only"
              onChange={alElegirFichero}
            />
          </div>

          {nombreFichero ? (
            <p className="texto-meta">
              {nombreFichero} · {plural(filas.length, 'fila', 'filas')}
            </p>
          ) : null}

          {faltanColumnas.length > 0 ? (
            <p className="flex items-start gap-2 text-meta text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Falta la columna {faltanColumnas.join(', ')}. Sin ella no se puede saber de qué
              máquina habla cada fila.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="titulo-tarjeta">Conectado a Notion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="texto-meta">
            Solo si has dado de alta la integración de Notion. Trae el parque sin exportar nada,
            pegando la dirección de la base. Si no la tienes montada, usa la exportación de arriba:
            hace lo mismo.
          </p>

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[16rem] flex-1 space-y-1.5">
              <Label htmlFor="base-notion">Dirección de la base</Label>
              <Input
                id="base-notion"
                value={baseNotion}
                onChange={(e) => setBaseNotion(e.target.value)}
                placeholder="https://www.notion.so/…"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void traerDeNotion()}
              disabled={leyendoNotion || baseNotion.trim() === ''}
            >
              {leyendoNotion ? <Loader2 className="animate-spin" /> : <Download />}
              Traer de Notion
            </Button>
          </div>

          <p className="texto-micro text-muted-foreground">
            La base tiene que estar compartida con la integración de Ergobox. En Notion, menú de
            los tres puntos, Conexiones.
          </p>
        </CardContent>
      </Card>

      {interpretacion ? (
        <>
          {interpretacion.problemas.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="titulo-tarjeta text-destructive">
                  {plural(
                    interpretacion.problemas.length,
                    'fila que no entra',
                    'filas que no entran',
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Fila a fila y con el número del CSV: quien lo arregla tiene el
                    fichero abierto delante con esa misma numeración. */}
                <ul className="space-y-1 texto-meta">
                  {interpretacion.problemas.map((p) => (
                    <li key={p.fila}>
                      <span className="font-medium text-foreground">Fila {p.fila}</span> · {p.motivo}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="titulo-tarjeta">
                2 · {plural(interpretacion.validas.length, 'máquina', 'máquinas')} que entran
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {maquinasActuales > 0 ? (
                <p className="texto-meta">
                  Este box ya tiene {plural(maquinasActuales, 'máquina', 'máquinas')}. Las que
                  coincidan de nombre se
                  actualizan; no se duplican ni se borran las que falten en el fichero.
                </p>
              ) : null}

              {interpretacion.validas.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Máquina</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Nº serie</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Cadencia</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {interpretacion.validas.map((f) => (
                        <TableRow key={f.nombre}>
                          <TableCell className="font-medium">{f.nombre}</TableCell>
                          <TableCell>{ETIQUETA_TIPO_MAQUINA[f.tipo]}</TableCell>
                          <TableCell className="tabular-nums">{f.numSerie ?? '—'}</TableCell>
                          <TableCell>{ETIQUETA_SEMAFORO[f.estado]}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {f.cadenciaMeses ? `${f.cadenciaMeses} meses` : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}

              <Button
                onClick={() => importar(interpretacion.validas)}
                disabled={interpretacion.validas.length === 0 || importando}
              >
                {importando ? <Loader2 className="animate-spin" /> : null}
                Importar {plural(interpretacion.validas.length, 'máquina', 'máquinas')}
              </Button>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
