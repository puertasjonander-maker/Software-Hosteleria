import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { exigirRol } from '@/lib/auth'
import { plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { EstadoVacio } from '@/components/ui/states'
import { ResolucionMapeo, type IngredientePendiente } from './resolucion-mapeo'

export const metadata: Metadata = { title: 'Mapeo de ingredientes' }
export const dynamic = 'force-dynamic'

export default async function PaginaMapeo() {
  await exigirRol('operador')
  const supabase = createClient()

  const { data: lineas } = await supabase
    .from('recipe_lines')
    .select('id, recipe_id, raw_ingredient_name, qty, unit, waste_pct, mapping_status')
    .neq('mapping_status', 'mapeado')

  if (!lineas || lineas.length === 0) {
    return (
      <EstadoVacio
        titulo="No queda nada por mapear"
        descripcion="Todos los ingredientes del escandallo apuntan a un producto del catálogo, así que el coste de cada elaboración se puede calcular."
        icono={CheckCircle2}
        accion={
          <Button asChild>
            <Link href="/escandallo">Ver las elaboraciones</Link>
          </Button>
        }
      />
    )
  }

  const [recetas, proveedores] = await Promise.all([
    supabase.from('recipes').select('id, name'),
    supabase.from('suppliers').select('id, name').eq('active', true).order('name'),
  ])

  const nombreReceta = new Map((recetas.data ?? []).map((r) => [r.id, r.name]))

  // Un mismo ingrediente aparece en varias elaboraciones. Se agrupa por nombre
  // para resolverlo una vez y no diez: es lo que hace que mapear un escandallo
  // entero sea cuestión de minutos y no de una tarde.
  const porNombre = new Map<string, IngredientePendiente>()

  for (const linea of lineas) {
    const clave = linea.raw_ingredient_name.toLowerCase()
    const existente = porNombre.get(clave)

    const uso = {
      lineId: linea.id,
      recetaNombre: nombreReceta.get(linea.recipe_id) ?? 'Elaboración',
      qty: Number(linea.qty),
      unit: linea.unit,
    }

    if (existente) {
      existente.usos.push(uso)
    } else {
      porNombre.set(clave, {
        nombre: linea.raw_ingredient_name,
        estado: linea.mapping_status,
        usos: [uso],
      })
    }
  }

  const pendientes = [...porNombre.values()].sort((a, b) => b.usos.length - a.usos.length)

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
        {plural(pendientes.length, 'ingrediente', 'ingredientes')} sin emparejar, en{' '}
        {plural(lineas.length, 'línea', 'líneas')} de escandallo. Mientras queden huecos, esas
        elaboraciones no muestran coste.
      </div>

      <ResolucionMapeo
        pendientes={pendientes}
        proveedores={(proveedores.data ?? []).map((s) => ({ id: s.id, nombre: s.name }))}
      />
    </div>
  )
}
