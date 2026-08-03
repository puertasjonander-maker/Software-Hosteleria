/**
 * Tipos de la base de datos.
 *
 * Escritos a mano y mantenidos en paralelo a `supabase/migrations/`. Cuando haya
 * un proyecto Supabase real, este fichero se regenera y deja de mantenerse a mano:
 *
 *   npx supabase gen types typescript --project-id <id> --schema public \
 *     > src/lib/database.types.ts
 *
 * Los tres alias de abajo (`Table`, `View`, `Fn`) existen solo para que la forma
 * que espera supabase-js no se coma el fichero en repetición.
 */

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

type View<Row> = { Row: Row; Relationships: [] }

type Fn<Args, Returns> = { Args: Args; Returns: Returns }

// ── Enums ────────────────────────────────────────────────────────────────────

export type RolUsuario = 'barista' | 'encargado' | 'operador'
export type CanalContacto = 'whatsapp' | 'email' | 'telefono'
export type UnidadBase = 'kg' | 'l' | 'ud'
export type EstadoSolicitud = 'pendiente' | 'en_pedido' | 'cancelada'
export type EstadoPedido = 'borrador' | 'enviado' | 'recibido_parcial' | 'cerrado'
export type TipoIncidencia =
  | 'ninguna'
  | 'falta'
  | 'danado'
  | 'precio_distinto'
  | 'sustituido'
export type OrigenPrecio = 'recepcion' | 'manual'
export type OrigenReceta = 'importado' | 'manual'
export type EstadoMapeo = 'mapeado' | 'ambiguo' | 'sin_mapear'
export type DisparadorCoste = 'recepcion' | 'precio_manual' | 'cambio_receta'

/** Procedencia de un dato de coste. Nunca se muestra un número sin esto. */
export type ProcedenciaCoste = 'real' | 'estimado' | 'sin_dato'

// ── Filas ────────────────────────────────────────────────────────────────────

export type LocationRow = {
  id: string
  name: string
  active: boolean
  created_at: string
}

export type ProfileRow = {
  id: string
  full_name: string
  role: RolUsuario
  location_id: string | null
  active: boolean
  created_at: string
}

export type SupplierRow = {
  id: string
  name: string
  contact_channel: CanalContacto
  contact_value: string
  notes: string | null
  active: boolean
  created_at: string
}

export type SupplierScheduleRow = {
  id: string
  supplier_id: string
  order_weekday: number
  cutoff_time: string
  delivery_weekday: number | null
  lead_time_days: number
  created_at: string
}

export type ProductRow = {
  id: string
  supplier_id: string
  name: string
  category: string
  order_unit: string
  base_unit: UnidadBase
  units_per_order_unit: number
  last_known_price: number | null
  active: boolean
  created_at: string
}

export type LocationProductRow = {
  location_id: string
  product_id: string
  par_level: number | null
  active: boolean
}

export type RequestRow = {
  id: string
  location_id: string
  product_id: string
  qty: number
  note: string | null
  requested_by: string
  status: EstadoSolicitud
  order_id: string | null
  client_ref: string | null
  created_at: string
  updated_at: string
}

export type OrderRow = {
  id: string
  supplier_id: string
  status: EstadoPedido
  order_date: string
  expected_delivery: string | null
  channel: CanalContacto
  sent_by: string | null
  sent_at: string | null
  message_snapshot: string | null
  supersedes_id: string | null
  created_by: string | null
  created_at: string
}

export type OrderLineRow = {
  id: string
  order_id: string
  product_id: string
  qty_total: number
  qty_by_location: Record<string, number>
  unit_price_expected: number | null
  created_at: string
}

export type ReceiptRow = {
  id: string
  order_id: string
  location_id: string
  received_by: string
  received_at: string
  doc_ref: string | null
  closed: boolean
  created_at: string
}

export type ReceiptLineRow = {
  id: string
  receipt_id: string
  product_id: string
  qty_received: number
  unit_price_actual: number | null
  incidence: TipoIncidencia
  note: string | null
  created_at: string
}

export type PriceHistoryRow = {
  id: string
  product_id: string
  price: number
  source: OrigenPrecio
  effective_date: string
  receipt_line_id: string | null
  created_at: string
}

export type RecipeRow = {
  id: string
  name: string
  yield_qty: number
  yield_unit: string
  square_item_ref: string | null
  current_price: number | null
  price_set_at: string | null
  active: boolean
  source: OrigenReceta
  created_at: string
}

export type RecipeLineRow = {
  id: string
  recipe_id: string
  product_id: string | null
  raw_ingredient_name: string
  qty: number
  unit: UnidadBase
  waste_pct: number
  mapping_status: EstadoMapeo
  created_at: string
}

export type RecipeCostSnapshotRow = {
  id: string
  recipe_id: string
  cost_total: number
  cost_per_yield: number
  is_real: boolean
  calculated_at: string
  trigger: DisparadorCoste
}

export type SettingRow = {
  key: string
  value: unknown
  updated_at: string
}

export type PushSubscriptionRow = {
  id: string
  profile_id: string
  endpoint: string
  p256dh: string
  auth: string
  created_at: string
}

// ── Vistas ───────────────────────────────────────────────────────────────────

export type ProductCurrentPriceRow = {
  product_id: string
  supplier_id: string
  base_unit: UnidadBase
  units_per_order_unit: number
  price_per_order_unit: number | null
  price_kind: ProcedenciaCoste
  unit_cost_base: number | null
  price_date: string | null
}

export type PendingBySupplierRow = {
  supplier_id: string
  supplier_name: string
  contact_channel: CanalContacto
  active: boolean
  line_count: number
  request_count: number
  estimated_amount: number | null
  has_products_without_price: boolean
  oldest_request_at: string
}

export type PendingRequestLineRow = {
  request_id: string
  product_id: string
  product_name: string
  category: string
  order_unit: string
  last_known_price: number | null
  supplier_id: string
  location_id: string
  location_name: string
  qty: number
  note: string | null
  requested_by: string
  requested_by_name: string | null
  created_at: string
}

export type RecipeCoverageRow = {
  recipe_id: string
  total_lines: number
  mapped_lines: number
  mapped_pct: number
  has_gaps: boolean
}

export type RecipeCurrentCostRow = {
  recipe_id: string
  name: string
  yield_qty: number
  yield_unit: string
  current_price: number | null
  price_set_at: string | null
  active: boolean
  total_lines: number
  mapped_lines: number
  mapped_pct: number
  has_gaps: boolean
  cost_total: number | null
  cost_per_yield: number | null
  is_real: boolean | null
  calculated_at: string | null
  oldest_price_date: string | null
  cost_kind: 'hueco' | 'sin_datos' | 'real' | 'estimado'
  margin_pct: number | null
}

export type ReceiptPriceDeviationRow = {
  receipt_line_id: string
  receipt_id: string
  product_id: string
  order_id: string
  price_now: number | null
  price_before: number | null
  price_before_date: string | null
  deviation_pct: number | null
}

export type SpendLineRow = {
  receipt_line_id: string
  receipt_id: string
  order_id: string
  location_id: string
  spend_date: string
  product_id: string
  product_name: string
  category: string
  supplier_id: string
  supplier_name: string
  qty_received: number
  unit_price: number | null
  amount: number | null
  price_kind: 'real' | 'estimado'
  incidence: TipoIncidencia
}

// ── Funciones ────────────────────────────────────────────────────────────────

export type MatchIngredientRow = {
  product_id: string
  product_name: string
  supplier_name: string
  base_unit: UnidadBase
  order_unit: string
  score: number
}

export type SimulatePriceChangeRow = {
  recipe_id: string
  recipe_name: string
  current_cost: number
  simulated_cost: number
  cost_delta_pct: number | null
  current_price: number | null
  current_margin_pct: number | null
  simulated_margin_pct: number | null
}

export type SetRequestQtyRow = {
  request_id: string | null
  my_qty: number
  location_qty: number
}

// ── Database ─────────────────────────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      locations: Table<LocationRow, Omit<LocationRow, 'id' | 'created_at'> & { id?: string }>
      profiles: Table<ProfileRow, Partial<ProfileRow> & { id: string }>
      suppliers: Table<SupplierRow, Partial<SupplierRow> & { name: string }>
      supplier_schedules: Table<
        SupplierScheduleRow,
        Partial<SupplierScheduleRow> & {
          supplier_id: string
          order_weekday: number
          cutoff_time: string
        }
      >
      products: Table<
        ProductRow,
        Partial<ProductRow> & {
          supplier_id: string
          name: string
          order_unit: string
          base_unit: UnidadBase
        }
      >
      location_products: Table<LocationProductRow>
      requests: Table<
        RequestRow,
        Partial<RequestRow> & {
          location_id: string
          product_id: string
          qty: number
          requested_by: string
        }
      >
      orders: Table<OrderRow, Partial<OrderRow> & { supplier_id: string }>
      order_lines: Table<
        OrderLineRow,
        Partial<OrderLineRow> & { order_id: string; product_id: string; qty_total: number }
      >
      receipts: Table<
        ReceiptRow,
        Partial<ReceiptRow> & {
          order_id: string
          location_id: string
          received_by: string
        }
      >
      receipt_lines: Table<
        ReceiptLineRow,
        Partial<ReceiptLineRow> & { receipt_id: string; product_id: string }
      >
      price_history: Table<
        PriceHistoryRow,
        Partial<PriceHistoryRow> & { product_id: string; price: number; source: OrigenPrecio }
      >
      recipes: Table<RecipeRow, Partial<RecipeRow> & { name: string }>
      recipe_lines: Table<
        RecipeLineRow,
        Partial<RecipeLineRow> & {
          recipe_id: string
          raw_ingredient_name: string
          qty: number
          unit: UnidadBase
        }
      >
      recipe_cost_snapshots: Table<RecipeCostSnapshotRow>
      settings: Table<SettingRow, Partial<SettingRow> & { key: string; value: unknown }>
      push_subscriptions: Table<
        PushSubscriptionRow,
        Partial<PushSubscriptionRow> & {
          profile_id: string
          endpoint: string
          p256dh: string
          auth: string
        }
      >
    }
    Views: {
      product_current_price: View<ProductCurrentPriceRow>
      pending_by_supplier: View<PendingBySupplierRow>
      pending_request_lines: View<PendingRequestLineRow>
      recipe_coverage: View<RecipeCoverageRow>
      recipe_current_cost: View<RecipeCurrentCostRow>
      receipt_price_deviation: View<ReceiptPriceDeviationRow>
      spend_lines: View<SpendLineRow>
    }
    Functions: {
      set_request_qty: Fn<
        { p_product_id: string; p_qty: number; p_location_id?: string | null; p_note?: string | null },
        SetRequestQtyRow[]
      >
      build_draft_order: Fn<{ p_supplier_id: string }, string>
      exclude_order_line: Fn<{ p_line_id: string }, undefined>
      send_order: Fn<
        {
          p_order_id: string
          p_message: string
          p_channel: CanalContacto
          p_expected_delivery?: string | null
        },
        undefined
      >
      create_complement_order: Fn<{ p_order_id: string }, string>
      receive_order_complete: Fn<
        { p_order_id: string; p_location_id: string; p_doc_ref?: string | null },
        string
      >
      match_ingredient: Fn<{ p_name: string; p_limit?: number }, MatchIngredientRow[]>
      simulate_price_change: Fn<
        { p_product_id: string; p_pct: number },
        SimulatePriceChangeRow[]
      >
    }
    Enums: {
      rol_usuario: RolUsuario
      canal_contacto: CanalContacto
      unidad_base: UnidadBase
      estado_solicitud: EstadoSolicitud
      estado_pedido: EstadoPedido
      tipo_incidencia: TipoIncidencia
      origen_precio: OrigenPrecio
      origen_receta: OrigenReceta
      estado_mapeo: EstadoMapeo
      disparador_coste: DisparadorCoste
    }
    CompositeTypes: Record<string, never>
  }
}
