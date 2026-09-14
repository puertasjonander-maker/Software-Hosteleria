-- ─────────────────────────────────────────────────────────────────────────────
-- Ergobox v1 — esquema base
--
-- El negocio: Ergo Box mantiene parques de máquinas (remos, ski, bikes, barras)
-- en boxes de crosstraining. Una visita a un box es un `servicio`; dentro de la
-- visita, cada máquina que se toca genera un `parte` con sus fotos de antes y
-- después. El `evento_maquina` es el histórico que ve el cliente.
--
-- Convenciones:
--   · Identificadores y valores de enum en español, igual que la interfaz.
--   · Importes numeric(10,2): aquí se factura en euros con dos decimales, no hay
--     precios unitarios a granel que obliguen a más precisión.
--   · created_at/updated_at en timestamptz. La app trabaja en Europe/Madrid.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ── Enums ────────────────────────────────────────────────────────────────────

create type rol_usuario as enum ('admin', 'tecnico', 'cliente');

create type tipo_maquina as enum (
  'rowerg', 'skierg', 'bikeerg', 'air_bike', 'cinta',
  'barra', 'disco', 'rack', 'otro'
);

-- El semáforo de la ficha de papel, tal cual. `sin_revisar` es el estado real de
-- una máquina recién inventariada: no es verde, es que todavía no se ha mirado.
create type semaforo as enum ('verde', 'ambar', 'rojo', 'sin_revisar');

create type estado_servicio as enum ('planificado', 'en_curso', 'hecho', 'cancelado');

create type momento_foto as enum ('antes', 'despues');

create type tipo_evento as enum ('alta', 'servicio', 'cambio_estado', 'incidencia', 'baja');

-- ── Clientes ─────────────────────────────────────────────────────────────────

create table clientes (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  direccion          text,
  poblacion          text,
  contacto_nombre    text,
  contacto_telefono  text,
  contacto_email     text,
  notas              text,
  activo             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index clientes_nombre_key on clientes (lower(nombre));

comment on table clientes is 'Un box. Es la unidad de aislamiento: toda la RLS cuelga de aquí.';

-- ── Perfiles (1:1 con auth.users) ────────────────────────────────────────────

create table perfiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nombre      text not null default '',
  rol         rol_usuario not null default 'cliente',
  cliente_id  uuid references clientes (id) on delete cascade,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on column perfiles.cliente_id is
  'El box del que es dueño este usuario. Solo tiene sentido con rol=cliente.';

-- Un interno nunca queda atado a un box concreto: si `cliente_id` está puesto,
-- el rol tiene que ser `cliente`. El caso contrario (cliente sin box asignado)
-- sí se permite, porque es el estado en el que nace un usuario recién invitado;
-- la RLS lo trata como "no alcanza a nadie" y no ve absolutamente nada.
alter table perfiles add constraint perfiles_cliente_coherente
  check (cliente_id is null or rol = 'cliente');

create index perfiles_cliente_idx on perfiles (cliente_id) where cliente_id is not null;

-- Alta automática de perfil al registrarse un usuario. El rol real y el box los
-- asigna un admin desde la pantalla de usuarios: nadie se da de alta con permisos.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, rol)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', ''), 'cliente')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Parque de máquinas ───────────────────────────────────────────────────────

create table maquinas (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null references clientes (id) on delete cascade,
  nombre           text not null,                    -- "RowErg 5"
  tipo             tipo_maquina not null default 'otro',
  marca            text,                             -- "Concept2"
  modelo           text,
  num_serie        text,
  ubicacion        text,                             -- "sala principal", "altillo"
  estado           semaforo not null default 'sin_revisar',
  cadencia_meses   smallint check (cadencia_meses between 1 and 36),
  ultima_revision  date,
  proxima_revision date,
  notas            text,
  activa           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on column maquinas.nombre is
  'Como la llama el box, no como la llama el fabricante. En IronBuster hay cinco '
  'remos idénticos y lo único que los distingue es "RowErg 1".."RowErg 5".';
comment on column maquinas.cadencia_meses is
  'Cada cuánto toca revisarla. Null = sin recurrencia contratada.';
comment on column maquinas.proxima_revision is
  'Derivada de ultima_revision + cadencia_meses por trigger. No se teclea.';

create unique index maquinas_cliente_nombre_key on maquinas (cliente_id, lower(nombre));
create index maquinas_cliente_idx on maquinas (cliente_id) where activa;
create index maquinas_proxima_idx on maquinas (proxima_revision)
  where activa and proxima_revision is not null;

-- ── Servicios (una visita a un box) ──────────────────────────────────────────

create table servicios (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references clientes (id) on delete cascade,
  fecha       date not null default (now() at time zone 'Europe/Madrid')::date,
  estado      estado_servicio not null default 'planificado',
  tecnico_id  uuid references perfiles (id) on delete set null,
  notas       text,
  cerrado_at  timestamptz,
  created_by  uuid references perfiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table servicios is
  'Una visita. Agrupa el trabajo de un día en un box; el trabajo real está en partes.';

create index servicios_cliente_fecha_idx on servicios (cliente_id, fecha desc);
create index servicios_abiertos_idx on servicios (estado, fecha)
  where estado in ('planificado', 'en_curso');

-- ── Partes (una máquina dentro de una visita) ────────────────────────────────

create table partes (
  id               uuid primary key default gen_random_uuid(),
  servicio_id      uuid not null references servicios (id) on delete cascade,
  maquina_id       uuid not null references maquinas (id) on delete restrict,
  trabajo_previsto text,
  trabajo_hecho    text,
  piezas           text,
  estado_antes     semaforo,
  estado_despues   semaforo,
  damper           smallint check (damper between 1 and 10),
  drag_factor      smallint check (drag_factor between 0 and 300),
  minutos          smallint check (minutos >= 0),
  importe          numeric(10,2) check (importe >= 0),
  hecho            boolean not null default false,
  client_ref       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (servicio_id, maquina_id)
);

comment on table partes is
  'La unidad de trabajo real: lo que se hizo a UNA máquina en UNA visita.';
comment on column partes.damper is
  'Solo aplica a Concept2. Se anota porque el box lo cambia y luego no sabe por qué '
  'los tiempos no cuadran.';
comment on column partes.importe is
  'Fuera del alcance de la v1 (los presupuestos siguen en Notion), pero la columna '
  'existe desde el principio para no tener que migrar cuando entren.';
comment on column partes.client_ref is
  'Identificador generado en el móvil. Permite reintentar la sincronización de una '
  'visita hecha sin cobertura sin duplicar el parte.';

create unique index partes_client_ref_key on partes (client_ref) where client_ref is not null;
create index partes_servicio_idx on partes (servicio_id);
create index partes_maquina_idx on partes (maquina_id);

-- ── Fotos ────────────────────────────────────────────────────────────────────

create table fotos (
  id         uuid primary key default gen_random_uuid(),
  parte_id   uuid not null references partes (id) on delete cascade,
  momento    momento_foto not null,
  ruta       text not null unique,
  orden      smallint not null default 0,
  bytes      integer check (bytes > 0),
  subida_por uuid references perfiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on column fotos.ruta is
  'Ruta dentro del bucket privado `fotos`, con forma <cliente_id>/<servicio_id>/'
  '<parte_id>/<uuid>.jpg. El cliente nunca recibe una URL pública: se le firma '
  'una caducable después de comprobar la misma regla de acceso.';
comment on column fotos.bytes is
  'Tamaño del fichero ya recomprimido. Sirve para detectar si alguien se saltó el '
  'redimensionado del móvil: una visita entera debería caber en unos 15 MB.';

create index fotos_parte_idx on fotos (parte_id, momento, orden);

-- ── Histórico por máquina ────────────────────────────────────────────────────

create table eventos_maquina (
  id                uuid primary key default gen_random_uuid(),
  maquina_id        uuid not null references maquinas (id) on delete cascade,
  fecha             date not null default (now() at time zone 'Europe/Madrid')::date,
  tipo              tipo_evento not null,
  texto             text not null default '',
  estado_resultante semaforo,
  parte_id          uuid references partes (id) on delete set null,
  autor_id          uuid references perfiles (id) on delete set null,
  created_at        timestamptz not null default now()
);

comment on table eventos_maquina is
  'El histórico. Tabla propia y no una consulta sobre partes, porque hay cosas que '
  'contar que no son un servicio: "llegó con óxido de fábrica", "se la llevaron a '
  'una competición". Los eventos de servicio los escriben triggers.';

create index eventos_maquina_idx on eventos_maquina (maquina_id, fecha desc, created_at desc);

-- ── Avisos ───────────────────────────────────────────────────────────────────

create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references perfiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create table aviso_log (
  id         uuid primary key default gen_random_uuid(),
  maquina_id uuid not null references maquinas (id) on delete cascade,
  perfil_id  uuid not null references perfiles (id) on delete cascade,
  enviado_el date not null,
  enviado_at timestamptz not null default now(),
  unique (maquina_id, perfil_id, enviado_el)
);

comment on table aviso_log is
  'Nunca más de un aviso por máquina, persona y día. Sin esto, un cron que se '
  'reintenta convierte un recordatorio en acoso.';

-- ── Ajustes ──────────────────────────────────────────────────────────────────

create table ajustes (
  clave      text primary key,
  valor      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into ajustes (clave, valor) values
  ('cadencia_meses_defecto',   '2'::jsonb),
  ('dias_aviso_revision',      '14'::jsonb),
  ('foto_lado_largo_px',       '1600'::jsonb),
  ('foto_calidad_jpeg',        '0.72'::jsonb);
