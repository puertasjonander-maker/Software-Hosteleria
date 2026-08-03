import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { FormularioAjustes } from './formulario-ajustes'

export const metadata: Metadata = { title: 'Ajustes' }
export const dynamic = 'force-dynamic'

const POR_DEFECTO: Record<string, number> = {
  price_deviation_threshold_pct: 5,
  cost_increase_alert_pct: 10,
  reminder_hours_encargado: 2,
  reminder_hours_barista: 4,
}

export default async function PaginaAjustes() {
  const supabase = createClient()
  const { data } = await supabase.from('settings').select('*')

  const valores = { ...POR_DEFECTO }
  for (const fila of data ?? []) {
    const numero = Number(fila.value)
    if (Number.isFinite(numero)) valores[fila.key] = numero
  }

  return <FormularioAjustes valores={valores} />
}
