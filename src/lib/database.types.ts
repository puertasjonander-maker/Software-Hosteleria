/**
 * Tipos de la base de datos.
 *
 * Escritos a mano y mantenidos en paralelo a `supabase/migrations/`. Cuando haya
 * un proyecto Supabase real, este fichero se regenera y deja de mantenerse a mano:
 *
 *   npx supabase gen types typescript --project-id <id> --schema public \
 *     > src/lib/database.types.ts
 *
 * Los dos alias de abajo (`Table`, `View`) existen solo para que la forma que
 * espera supabase-js no se coma el fichero en repetición.
 */

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

type View<Row> = { Row: Row; Relationships: [] }

// ── Enums ────────────────────────────────────────────────────────────────────

export type RolUsuario = 'admin' | 'tecnico' | 'cliente'

export type TipoMaquina =
  | 'rowerg'
  | 'skierg'
  | 'bikeerg'
  | 'air_bike'
  | 'cinta'
  | 'barra'
  | 'disco'
  | 'rack'
  | 'otro'

/** El semáforo de la ficha de papel. `sin_revisar` no es verde: es que no se ha mirado. */
export type Semaforo = 'verde' | 'ambar' | 'rojo' | 'sin_revisar'

export type EstadoServicio = 'planificado' | 'en_curso' | 'hecho' | 'cancelado'

export type MomentoFoto = 'antes' | 'despues'

export type TipoEvento = 'alta' | 'servicio' | 'cambio_estado' | 'incidencia' | 'baja'

// ── Filas ────────────────────────────────────────────────────────────────────

export type ClienteRow = {
  id: string
  nombre: string
  direccion: string | null
  poblacion: string | null
  contacto_nombre: string | null
  contacto_telefono: string | null
  contacto_email: string | null
  notas: string | null
  activo: boolean
  created_at: string
  updated_at: string
}

export type PerfilRow = {
  id: string
  nombre: string
  /** Copia del correo de `auth.users`, mantenida por trigger. */
  email: string | null
  rol: RolUsuario
  /** El box del que es dueño. Solo se rellena con rol `cliente`. */
  cliente_id: string | null
  activo: boolean
  created_at: string
}

export type MaquinaRow = {
  id: string
  cliente_id: string
  nombre: string
  tipo: TipoMaquina
  marca: string | null
  modelo: string | null
  num_serie: string | null
  ubicacion: string | null
  estado: Semaforo
  cadencia_meses: number | null
  ultima_revision: string | null
  /** Derivada por trigger de `ultima_revision` + `cadencia_meses`. No se escribe. */
  proxima_revision: string | null
  notas: string | null
  activa: boolean
  created_at: string
  updated_at: string
}

export type ServicioRow = {
  id: string
  cliente_id: string
  fecha: string
  estado: EstadoServicio
  tecnico_id: string | null
  notas: string | null
  cerrado_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ParteRow = {
  id: string
  servicio_id: string
  maquina_id: string
  trabajo_previsto: string | null
  trabajo_hecho: string | null
  piezas: string | null
  estado_antes: Semaforo | null
  estado_despues: Semaforo | null
  damper: number | null
  drag_factor: number | null
  minutos: number | null
  importe: number | null
  hecho: boolean
  /** Idempotencia de la cola offline: el móvil lo genera antes de tener red. */
  client_ref: string | null
  created_at: string
  updated_at: string
}

export type FotoRow = {
  id: string
  parte_id: string
  momento: MomentoFoto
  /** Ruta en el bucket privado. Nunca se expone tal cual: se pide firmada. */
  ruta: string
  orden: number
  bytes: number | null
  subida_por: string | null
  created_at: string
}

export type EventoMaquinaRow = {
  id: string
  maquina_id: string
  fecha: string
  tipo: TipoEvento
  texto: string
  estado_resultante: Semaforo | null
  parte_id: string | null
  autor_id: string | null
  created_at: string
}

export type PushSubscriptionRow = {
  id: string
  perfil_id: string
  endpoint: string
  p256dh: string
  auth: string
  created_at: string
}

export type AvisoLogRow = {
  id: string
  maquina_id: string
  perfil_id: string
  enviado_el: string
  enviado_at: string
}

export type AjusteRow = {
  clave: string
  valor: unknown
  updated_at: string
}

// ── Vistas ───────────────────────────────────────────────────────────────────

export type ParqueEstadoRow = {
  id: string
  cliente_id: string
  nombre: string
  tipo: TipoMaquina
  marca: string | null
  num_serie: string | null
  estado: Semaforo
  cadencia_meses: number | null
  ultima_revision: string | null
  proxima_revision: string | null
  activa: boolean
  servicios_hechos: number
  /** Negativo = revisión vencida. Null = sin cadencia contratada. */
  dias_hasta_revision: number | null
  modelo: string | null
  ubicacion: string | null
  notas: string | null
}

// ── Database ─────────────────────────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      clientes: Table<ClienteRow, Partial<ClienteRow> & { nombre: string }>
      perfiles: Table<PerfilRow, Partial<PerfilRow> & { id: string }>
      maquinas: Table<
        MaquinaRow,
        Partial<MaquinaRow> & { cliente_id: string; nombre: string }
      >
      servicios: Table<ServicioRow, Partial<ServicioRow> & { cliente_id: string }>
      partes: Table<
        ParteRow,
        Partial<ParteRow> & { servicio_id: string; maquina_id: string }
      >
      fotos: Table<
        FotoRow,
        Partial<FotoRow> & { parte_id: string; momento: MomentoFoto; ruta: string }
      >
      eventos_maquina: Table<
        EventoMaquinaRow,
        Partial<EventoMaquinaRow> & { maquina_id: string; tipo: TipoEvento }
      >
      push_subscriptions: Table<
        PushSubscriptionRow,
        Partial<PushSubscriptionRow> & {
          perfil_id: string
          endpoint: string
          p256dh: string
          auth: string
        }
      >
      // Sin políticas RLS: solo lo toca el cron con la service role key.
      aviso_log: Table<
        AvisoLogRow,
        Partial<AvisoLogRow> & { maquina_id: string; perfil_id: string; enviado_el: string }
      >
      ajustes: Table<AjusteRow, Partial<AjusteRow> & { clave: string; valor: unknown }>
    }
    Views: {
      parque_estado: View<ParqueEstadoRow>
    }
    Functions: Record<string, never>
    Enums: {
      rol_usuario: RolUsuario
      tipo_maquina: TipoMaquina
      semaforo: Semaforo
      estado_servicio: EstadoServicio
      momento_foto: MomentoFoto
      tipo_evento: TipoEvento
    }
    CompositeTypes: Record<string, never>
  }
}
