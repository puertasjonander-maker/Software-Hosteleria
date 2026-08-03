'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import {
  interpretarFilas,
  type ColumnasEscandallo,
  type FilaEscandallo,
} from '@/lib/escandallo'
import { cantidad, plural, porcentaje } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { importarEscandallo, type ResumenImportacion } from '../acciones'

type Campo = {
  clave: keyof ColumnasEscandallo
  etiqueta: string
  obligatorio: boolean
  ayuda: string
  /** Palabras que suelen aparecer en esa cabecera, para proponer el mapeo. */
  pistas: string[]
}

const CAMPOS: Campo[] = [
  {
    clave: 'elaboracion',
    etiqueta: 'Elaboración',
    obligatorio: true,
    ayuda: 'El plato o la bebida. Se repite en cada una de sus líneas.',
    pistas: ['elaboracion', 'plato', 'receta', 'producto final', 'articulo', 'nombre'],
  },
  {
    clave: 'ingrediente',
    etiqueta: 'Ingrediente',
    obligatorio: true,
    ayuda: 'El nombre tal cual está en el Excel. Se conserva siempre.',
    pistas: ['ingrediente', 'materia', 'componente', 'insumo'],
  },
  {
    clave: 'cantidad',
    etiqueta: 'Cantidad',
    obligatorio: true,
    ayuda: 'Cuánto lleva de ese ingrediente.',
    pistas: ['cantidad', 'peso', 'cant', 'qty', 'dosis'],
  },
  {
    clave: 'unidad',
    etiqueta: 'Unidad',
    obligatorio: true,
    ayuda: 'g, kg, ml, l o ud. Los gramos y mililitros se convierten solos.',
    pistas: ['unidad', 'medida', 'um', 'unid'],
  },
  {
    clave: 'merma',
    etiqueta: 'Merma (%)',
    obligatorio: false,
    ayuda: 'Lo que se pierde al pelar, limpiar o cocinar.',
    pistas: ['merma', 'rendimiento', 'desperdicio', 'perdida'],
  },
  {
    clave: 'raciones',
    etiqueta: 'Raciones',
    obligatorio: false,
    ayuda: 'Cuántas raciones salen. Si no está, se asume 1.',
    pistas: ['racion', 'raciones', 'rendimiento', 'porciones', 'unidades producidas'],
  },
  {
    clave: 'unidadRacion',
    etiqueta: 'Unidad de ración',
    obligatorio: false,
    ayuda: '"ud", "plato", "vaso"…',
    pistas: ['unidad racion', 'tipo racion'],
  },
  {
    clave: 'pvp',
    etiqueta: 'PVP',
    obligatorio: false,
    ayuda: 'Precio de venta con IVA. Sirve para calcular el margen.',
    pistas: ['pvp', 'precio venta', 'venta', 'carta'],
  },
]

function normalizarCabecera(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]/g, ' ')
    .trim()
}

/** Propone un mapeo inicial. Es una propuesta: quien decide es la persona. */
function proponerMapeo(cabeceras: string[]): Partial<ColumnasEscandallo> {
  const propuesta: Partial<ColumnasEscandallo> = {}
  const usadas = new Set<string>()

  for (const campo of CAMPOS) {
    const encontrada = cabeceras.find((cabecera) => {
      if (usadas.has(cabecera)) return false
      const normalizada = normalizarCabecera(cabecera)
      return campo.pistas.some((pista) => normalizada.includes(pista))
    })

    if (encontrada) {
      propuesta[campo.clave] = encontrada
      usadas.add(encontrada)
    }
  }

  return propuesta
}

/**
 * Importador de escandallo (MISE-008).
 *
 * El fichero se lee en el navegador y solo viajan al servidor las filas ya
 * interpretadas: así el operador ve la previsualización sin subir nada y sin
 * esperar, y un Excel con hojas de otras cosas no acaba almacenado en ningún
 * sitio.
 */
export function ImportadorEscandallo({
  productosEnCatalogo,
}: {
  productosEnCatalogo: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const [nombreFichero, setNombreFichero] = useState<string | null>(null)
  const [hojas, setHojas] = useState<string[]>([])
  const [hoja, setHoja] = useState<string>('')
  const [libro, setLibro] = useState<unknown>(null)
  const [filas, setFilas] = useState<Record<string, unknown>[]>([])
  const [cabeceras, setCabeceras] = useState<string[]>([])
  const [columnas, setColumnas] = useState<Partial<ColumnasEscandallo>>({})
  const [leyendo, setLeyendo] = useState(false)
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null)
  const [importando, iniciarImportacion] = useTransition()

  async function cargarHoja(libroExcel: unknown, nombreHoja: string) {
    const XLSX = await import('xlsx')
    const wb = libroExcel as import('xlsx').WorkBook
    const datos = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[nombreHoja], {
      defval: '',
      raw: true,
    })

    const columnasDetectadas = datos.length > 0 ? Object.keys(datos[0]) : []
    setFilas(datos)
    setCabeceras(columnasDetectadas)
    setColumnas(proponerMapeo(columnasDetectadas))
    setResumen(null)
  }

  async function alElegirFichero(e: React.ChangeEvent<HTMLInputElement>) {
    const fichero = e.target.files?.[0]
    if (!fichero) return

    setLeyendo(true)
    try {
      // xlsx pesa: se carga solo cuando de verdad hay un fichero que abrir.
      const XLSX = await import('xlsx')
      const buffer = await fichero.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })

      setNombreFichero(fichero.name)
      setLibro(wb)
      setHojas(wb.SheetNames)
      setHoja(wb.SheetNames[0])
      await cargarHoja(wb, wb.SheetNames[0])
    } catch {
      toast.error('No hemos podido leer el fichero', {
        description: 'Comprueba que es un .xlsx, .xls o .csv y que no está protegido.',
      })
    } finally {
      setLeyendo(false)
    }
  }

  const mapeoCompleto = CAMPOS.filter((c) => c.obligatorio).every((c) => columnas[c.clave])

  const interpretacion = useMemo(() => {
    if (!mapeoCompleto) return null
    return interpretarFilas(filas, columnas as ColumnasEscandallo)
  }, [filas, columnas, mapeoCompleto])

  const elaboracionesDistintas = useMemo(
    () => new Set(interpretacion?.validas.map((f) => f.elaboracion) ?? []).size,
    [interpretacion],
  )

  const sinUnidadReconocida = interpretacion?.validas.filter((f) => !f.unidadReconocida) ?? []

  function importar(validas: FilaEscandallo[]) {
    iniciarImportacion(async () => {
      const resultado = await importarEscandallo(validas)
      setResumen(resultado)

      if (resultado.ok) {
        toast.success('Escandallo importado')
      } else {
        toast.error('La importación ha fallado', { description: resultado.mensaje })
      }
    })
  }

  if (resumen?.ok) {
    const pendientes = resumen.ambiguas + resumen.sinMapear
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-5 w-5 text-ok" />
            Importación terminada
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-1 text-sm">
            <li>
              {plural(resumen.elaboraciones, 'elaboración importada', 'elaboraciones importadas')}
              , {plural(resumen.lineas, 'línea', 'líneas')} en total.
            </li>
            <li className="text-ok">
              {resumen.mapeadasAuto} líneas emparejadas automáticamente con el catálogo.
            </li>
            {pendientes > 0 ? (
              <li className="text-warn">
                {pendientes} líneas esperan que alguien las mire: {resumen.ambiguas} dudosas y{' '}
                {resumen.sinMapear} sin candidato.
              </li>
            ) : null}
          </ul>

          {/* Una importación parcial es un resultado válido, no un error
              (MISE-008, criterio de experiencia). */}
          {pendientes > 0 ? (
            <p className="text-sm text-muted-foreground">
              Las elaboraciones con líneas sin mapear se han importado igualmente, marcadas
              como incompletas. No tienen coste hasta que se resuelva el mapeo, y hasta
              entonces la app no enseña ningún número por ellas.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {pendientes > 0 ? (
              <Button asChild>
                <Link href="/escandallo/mapeo">Resolver el mapeo</Link>
              </Button>
            ) : null}
            <Button asChild variant={pendientes > 0 ? 'outline' : 'default'}>
              <Link href="/escandallo">Ver las elaboraciones</Link>
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setResumen(null)
                setNombreFichero(null)
                setFilas([])
                setCabeceras([])
                setColumnas({})
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
          <CardTitle className="text-base">1 · El fichero</CardTitle>
          <p className="text-sm text-muted-foreground">
            Excel o CSV, con la estructura que ya tengáis. El importador no da nada por
            supuesto: en el paso 2 le dices tú qué es cada columna.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv,text/csv"
            onChange={alElegirFichero}
            className="block w-full text-sm file:mr-3 file:h-10 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-4 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
          />

          {leyendo ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Leyendo el fichero…
            </p>
          ) : null}

          {nombreFichero ? (
            <p className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              {nombreFichero} · {plural(filas.length, 'fila', 'filas')}
            </p>
          ) : null}

          {hojas.length > 1 ? (
            <div className="max-w-xs space-y-1.5">
              <Label htmlFor="hoja">Hoja</Label>
              <Select
                id="hoja"
                value={hoja}
                onChange={async (e) => {
                  setHoja(e.target.value)
                  if (libro) await cargarHoja(libro, e.target.value)
                }}
              >
                {hojas.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {cabeceras.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">2 · Qué es cada columna</CardTitle>
            <p className="text-sm text-muted-foreground">
              Hemos propuesto un mapeo mirando las cabeceras. Corrígelo donde haga falta.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {CAMPOS.map((campo) => (
              <div key={campo.clave} className="space-y-1.5">
                <Label htmlFor={`col-${campo.clave}`}>
                  {campo.etiqueta}
                  {campo.obligatorio ? (
                    <span className="ml-1 text-destructive">*</span>
                  ) : (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      (opcional)
                    </span>
                  )}
                </Label>
                <Select
                  id={`col-${campo.clave}`}
                  value={columnas[campo.clave] ?? ''}
                  onChange={(e) =>
                    setColumnas((previo) => ({
                      ...previo,
                      [campo.clave]: e.target.value || undefined,
                    }))
                  }
                >
                  <option value="">— sin asignar —</option>
                  {cabeceras.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">{campo.ayuda}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {interpretacion ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">3 · Previsualización</CardTitle>
            <p className="text-sm text-muted-foreground">
              Nada se ha guardado todavía. Comprueba que las cantidades cuadran antes de
              confirmar.
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <span>
                <strong>{elaboracionesDistintas}</strong>{' '}
                {elaboracionesDistintas === 1 ? 'elaboración' : 'elaboraciones'}
              </span>
              <span>
                <strong>{interpretacion.validas.length}</strong> líneas listas
              </span>
              {interpretacion.descartadas.length > 0 ? (
                <span className="text-warn">
                  <strong>{interpretacion.descartadas.length}</strong> filas con problemas
                </span>
              ) : null}
              <span className="text-muted-foreground">
                {productosEnCatalogo} productos en catálogo para emparejar
              </span>
            </div>

            {sinUnidadReconocida.length > 0 ? (
              <div className="flex items-start gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {sinUnidadReconocida.length} líneas traen una unidad que no reconocemos (
                  {[...new Set(sinUnidadReconocida.map((f) => f.unidadOriginal || '(vacía)'))]
                    .slice(0, 5)
                    .join(', ')}
                  ). Se importan como &laquo;ud&raquo;; revísalas después en la elaboración.
                </span>
              </div>
            ) : null}

            {/* Los errores se muestran POR FILA, no como un fallo global
                (MISE-000 y MISE-008). */}
            {interpretacion.descartadas.length > 0 ? (
              <details className="rounded-md border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                  Ver las {interpretacion.descartadas.length} filas que no se van a importar
                </summary>
                <ul className="max-h-48 overflow-auto border-t px-3 py-2 text-sm">
                  {interpretacion.descartadas.map((d) => (
                    <li key={d.fila} className="text-muted-foreground">
                      Fila {d.fila}: {d.motivo}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Elaboración</TableHead>
                    <TableHead>Ingrediente</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">Merma</TableHead>
                    <TableHead className="text-right">Raciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interpretacion.validas.slice(0, 12).map((fila, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{fila.elaboracion}</TableCell>
                      <TableCell>{fila.ingrediente}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {cantidad(fila.cantidad)}
                      </TableCell>
                      <TableCell>
                        {fila.unidad}
                        {!fila.unidadReconocida ? (
                          <Badge variant="estimado" className="ml-1.5">
                            {fila.unidadOriginal || 'sin unidad'}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fila.mermaPct > 0 ? porcentaje(fila.mermaPct) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fila.raciones}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {interpretacion.validas.length > 12 ? (
                <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                  y {interpretacion.validas.length - 12} líneas más.
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              <Button
                disabled={interpretacion.validas.length === 0 || importando}
                onClick={() => importar(interpretacion.validas)}
              >
                {importando ? <Loader2 className="animate-spin" /> : <Upload />}
                Importar {interpretacion.validas.length} líneas
              </Button>
              <p className="text-xs text-muted-foreground">
                Si una elaboración ya existe, se sustituyen sus líneas por las del fichero.
              </p>
            </div>

            {resumen && !resumen.ok ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {resumen.mensaje}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : cabeceras.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Asigna al menos elaboración, ingrediente, cantidad y unidad para ver la
          previsualización.
        </p>
      ) : null}
    </div>
  )
}
