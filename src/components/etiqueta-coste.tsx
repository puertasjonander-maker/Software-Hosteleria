import { Badge } from '@/components/ui/badge'
import { fecha } from '@/lib/format'

/**
 * Un coste con más de 90 días es un coste viejo. No se oculta: se enseña con la
 * fecha del último dato, que es lo que MISE-009 pide en vez de "un número
 * silencioso".
 */
const DIAS_PARA_DESACTUALIZADO = 90

export function esCosteDesactualizado(fechaDato: string | null): boolean {
  if (!fechaDato) return false
  const dato = new Date(`${fechaDato}T12:00:00Z`).getTime()
  if (Number.isNaN(dato)) return false
  return Date.now() - dato > DIAS_PARA_DESACTUALIZADO * 86400000
}

/**
 * Procedencia de un coste, siempre visible junto al número.
 *
 * Es la regla 7 del BUILD_SPEC hecha componente: si el importe se enseña sin
 * esta etiqueta, alguien acabará tomando una decisión de precio con un dato del
 * Excel de hace dos años creyendo que es de ayer.
 */
export function EtiquetaCoste({
  tipo,
  desactualizado = false,
  fechaDato = null,
}: {
  tipo: 'real' | 'estimado' | 'hueco' | 'sin_datos'
  desactualizado?: boolean
  fechaDato?: string | null
}) {
  if (tipo === 'hueco') {
    return <Badge variant="hueco">faltan mapeos</Badge>
  }

  if (tipo === 'sin_datos') {
    return <Badge variant="hueco">sin precio</Badge>
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge variant={tipo === 'real' ? 'real' : 'estimado'}>
        {tipo === 'real' ? 'real' : 'estimado'}
      </Badge>
      {desactualizado ? (
        <span className="text-xs text-warn">
          desactualizado{fechaDato ? ` · ${fecha(fechaDato)}` : ''}
        </span>
      ) : null}
    </span>
  )
}
