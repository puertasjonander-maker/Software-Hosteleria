'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Download, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import {
  COLUMNAS_PARQUE,
  COLUMNAS_PARQUE_OBLIGATORIAS,
  interpretarParque,
  leerFicheroParque,
  plantillaParqueCsv,
  type FilaParque,
} from '@/lib/parque'
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
import { importarParque, type ResumenParque } from '../../acciones'

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
  const [resumen, setResumen] = useState<ResumenParque | null>(null)
  const [importando, iniciar] = useTransition()

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
                {resumen.creadas} {plural(resumen.creadas, 'máquina nueva', 'máquinas nuevas')}
                {resumen.actualizadas > 0
                  ? ` y ${resumen.actualizadas} ${plural(
                      resumen.actualizadas,
                      'actualizada',
                      'actualizadas',
                    )}`
                  : ''}
                .
              </p>
            </div>
          </div>
          <Button asChild>
            <Link href={`/clientes/${clienteId}`}>Ver el parque de {clienteNombre}</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="titulo-tarjeta">1 · El fichero</CardTitle>
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
              {nombreFichero} · {filas.length} {plural(filas.length, 'fila', 'filas')}
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

      {interpretacion ? (
        <>
          {interpretacion.problemas.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="titulo-tarjeta text-destructive">
                  {interpretacion.problemas.length}{' '}
                  {plural(interpretacion.problemas.length, 'fila que no entra', 'filas que no entran')}
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
                2 · {interpretacion.validas.length}{' '}
                {plural(interpretacion.validas.length, 'máquina', 'máquinas')} que entran
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {maquinasActuales > 0 ? (
                <p className="texto-meta">
                  Este box ya tiene {maquinasActuales}{' '}
                  {plural(maquinasActuales, 'máquina', 'máquinas')}. Las que coincidan de nombre se
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
                Importar {interpretacion.validas.length}{' '}
                {plural(interpretacion.validas.length, 'máquina', 'máquinas')}
              </Button>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
