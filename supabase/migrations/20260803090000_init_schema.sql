-- ─────────────────────────────────────────────────────────────────────────────
-- Mise v1 — esquema base
-- BUILD_SPEC.md §1 (modelo de datos) + §5.5 (escandallo)
--
-- Convenciones:
--   · Todos los identificadores y valores de enum van en español, igual que la UI.
--   · Todo importe monetario es numeric(12,4): los precios unitarios de hostelería
--     bajan a la cuarta decimal (café a granel, especias) y no queremos redondeo
--     acumulado en el escandallo.
--   · created_at/updated_at en timestamptz. La app trabaja en Europe/Madrid.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";   -- emparejado por similitud en MISE-008

-- ── Enums ────────────────────────────────────────────────────────────────────

create type rol_usuario        as enum ('barista', 'encargado', 'operador');
create type canal_contacto     as enum ('whatsapp', 'email', 'telefono');
create type unidad_base        as enum ('kg', 'l', 'ud');
create type estado_solicitud   as enum ('pendiente', 'en_pedido', 'cancelada');
create type estado_pedido      as enum ('borrador', 'enviado', 'recibido_parcial', 'cerrado');
create type tipo_incidencia    as enum ('ninguna', 'falta', 'danado', 'precio_distinto', 'sustituido');
create type origen_precio      as enum ('recepcion', 'manual');
create type origen_receta      as enum ('importado', 'manual');
create type estado_mapeo       as enum ('mapeado', 'ambiguo', 'sin_mapear');
create type disparador_coste   as enum ('recepcion', 'precio_manual', 'cambio_receta');

-- ── Locales ──────────────────────────────────────────────────────────────────

create table locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── Perfiles (1:1 con auth.users) ────────────────────────────────────────────

create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  role        rol_usuario not null default 'barista',
  location_id uuid references locations (id) on delete set null, -- null para operador
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on column profiles.location_id is
  'Local al que pertenece. Null para operador (ve los tres locales).';

-- Alta automática de perfil al registrarse un usuario en auth.users.
-- El rol y el local reales los asigna el operador desde /admin/usuarios.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, location_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_user_meta_data ->> 'role')::rol_usuario, 'barista'),
    nullif(new.raw_user_meta_data ->> 'location_id', '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Proveedores y pautas de pedido ───────────────────────────────────────────

create table suppliers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  contact_channel  canal_contacto not null default 'whatsapp',
  contact_value    text not null default '',
  notes            text,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

create unique index suppliers_name_key on suppliers (lower(name));

create table supplier_schedules (
  id                uuid primary key default gen_random_uuid(),
  supplier_id       uuid not null references suppliers (id) on delete cascade,
  order_weekday     smallint not null check (order_weekday between 0 and 6), -- 0 = domingo
  cutoff_time       time not null,
  delivery_weekday  smallint check (delivery_weekday between 0 and 6),
  lead_time_days    smallint not null default 1 check (lead_time_days >= 0),
  created_at        timestamptz not null default now(),
  unique (supplier_id, order_weekday)
);

comment on table supplier_schedules is
  'Pauta de pedido: qué día se pide, hasta qué hora, y qué día entrega.';

-- ── Catálogo ─────────────────────────────────────────────────────────────────

create table products (
  id                    uuid primary key default gen_random_uuid(),
  supplier_id           uuid not null references suppliers (id) on delete restrict,
  name                  text not null,
  category              text not null default 'sin categoría',
  order_unit            text not null,                 -- "caja 6 ud", "saco 1 kg"
  base_unit             unidad_base not null,
  units_per_order_unit  numeric(12,4) not null default 1 check (units_per_order_unit > 0),
  last_known_price      numeric(12,4) check (last_known_price >= 0), -- informativo
  active                boolean not null default true,
  created_at            timestamptz not null default now()
);

comment on column products.units_per_order_unit is
  'Factor explícito order_unit → base_unit. Un "saco 1 kg" con base_unit kg vale 1; '
  'una "caja 6 ud" con base_unit ud vale 6. Nunca se adivina (MISE-008).';
comment on column products.last_known_price is
  'Último precio conocido POR ORDER_UNIT. Informativo, no vinculante: solo alimenta '
  'la estimación de importe hasta que exista una recepción.';

create unique index products_supplier_name_key on products (supplier_id, lower(name));
create index products_category_idx on products (category);
create index products_name_trgm_idx on products using gin (name gin_trgm_ops);

create table location_products (
  location_id uuid not null references locations (id) on delete cascade,
  product_id  uuid not null references products (id) on delete cascade,
  par_level   numeric(12,4) check (par_level >= 0),   -- nivel objetivo, opcional
  active      boolean not null default true,
  primary key (location_id, product_id)
);

-- ── Solicitudes de reposición (MISE-001) ─────────────────────────────────────

create table requests (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references locations (id) on delete cascade,
  product_id    uuid not null references products (id) on delete cascade,
  qty           numeric(12,4) not null check (qty > 0),  -- en order_unit
  note          text,
  requested_by  uuid not null references profiles (id) on delete restrict,
  status        estado_solicitud not null default 'pendiente',
  order_id      uuid,                                    -- FK añadida tras orders
  client_ref    text,                                    -- idempotencia offline
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column requests.client_ref is
  'Identificador generado en el móvil. Permite reintentar la sincronización offline '
  'sin duplicar la solicitud (MISE-001).';

create unique index requests_client_ref_key on requests (client_ref)
  where client_ref is not null;
create index requests_pendientes_idx on requests (status, location_id)
  where status = 'pendiente';
create index requests_order_idx on requests (order_id);

-- ── Pedidos (MISE-002 / MISE-003) ────────────────────────────────────────────

create table orders (
  id                 uuid primary key default gen_random_uuid(),
  supplier_id        uuid not null references suppliers (id) on delete restrict,
  status             estado_pedido not null default 'borrador',
  order_date         date not null default (now() at time zone 'Europe/Madrid')::date,
  expected_delivery  date,
  channel            canal_contacto not null default 'whatsapp',
  sent_by            uuid references profiles (id) on delete set null,
  sent_at            timestamptz,
  message_snapshot   text,     -- copia exacta del texto enviado, inmutable
  supersedes_id      uuid references orders (id) on delete set null, -- complementario
  created_by         uuid references profiles (id) on delete set null,
  created_at         timestamptz not null default now()
);

comment on column orders.message_snapshot is
  'Texto literal que salió al proveedor. Es la prueba de lo pedido: no se recalcula.';
comment on column orders.supersedes_id is
  'Un pedido enviado es inmutable. Corregirlo genera un pedido complementario que '
  'apunta aquí al original (MISE-003).';

create index orders_supplier_status_idx on orders (supplier_id, status);

alter table requests
  add constraint requests_order_id_fkey
  foreign key (order_id) references orders (id) on delete set null;

create table order_lines (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references orders (id) on delete cascade,
  product_id           uuid not null references products (id) on delete restrict,
  qty_total            numeric(12,4) not null check (qty_total > 0),
  qty_by_location      jsonb not null default '{}'::jsonb,  -- {"<location_id>": 3, …}
  unit_price_expected  numeric(12,4) check (unit_price_expected >= 0),
  created_at           timestamptz not null default now(),
  unique (order_id, product_id)
);

comment on column order_lines.qty_by_location is
  'Desglose por local de la cantidad total. Se conserva aunque el encargado ajuste '
  'qty_total: sirve para repartir la entrega en recepción.';

-- ── Recepción (MISE-005 / MISE-006) ──────────────────────────────────────────

create table receipts (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders (id) on delete cascade,
  location_id  uuid not null references locations (id) on delete restrict,
  received_by  uuid not null references profiles (id) on delete restrict,
  received_at  timestamptz not null default now(),
  doc_ref      text,          -- nº de albarán
  closed       boolean not null default false,
  created_at   timestamptz not null default now()
);

comment on column receipts.closed is
  'Una recepción a medias se puede retomar después: mientras closed = false sigue '
  'siendo editable (MISE-005).';

create index receipts_order_idx on receipts (order_id);

create table receipt_lines (
  id                 uuid primary key default gen_random_uuid(),
  receipt_id         uuid not null references receipts (id) on delete cascade,
  product_id         uuid not null references products (id) on delete restrict,
  qty_received       numeric(12,4) not null default 0 check (qty_received >= 0),
  unit_price_actual  numeric(12,4) check (unit_price_actual >= 0),
  incidence          tipo_incidencia not null default 'ninguna',
  note               text,
  created_at         timestamptz not null default now(),
  unique (receipt_id, product_id)
);

create index receipt_lines_incidence_idx on receipt_lines (incidence)
  where incidence <> 'ninguna';

create table price_history (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references products (id) on delete cascade,
  price          numeric(12,4) not null check (price >= 0),  -- por order_unit
  source         origen_precio not null,
  effective_date date not null default (now() at time zone 'Europe/Madrid')::date,
  receipt_line_id uuid references receipt_lines (id) on delete set null,
  created_at     timestamptz not null default now()
);

comment on column price_history.source is
  'recepcion = precio real de un albarán. manual = precio introducido a mano o '
  'importado del Excel; en la interfaz se presenta SIEMPRE como estimado.';

create index price_history_product_date_idx
  on price_history (product_id, effective_date desc, created_at desc);

-- ── Escandallo (MISE-008 / MISE-009) ─────────────────────────────────────────

create table recipes (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  yield_qty        numeric(12,4) not null default 1 check (yield_qty > 0),
  yield_unit       text not null default 'ración',
  square_item_ref  text,     -- mapeo manual al artículo de Square (fuera de v1)
  current_price    numeric(12,4) check (current_price >= 0),  -- PVP actual, manual
  price_set_at     timestamptz,
  active           boolean not null default true,
  source           origen_receta not null default 'importado',
  created_at       timestamptz not null default now()
);

comment on column recipes.current_price is
  'PVP con IVA que se cobra hoy. Manual: Mise no es un TPV y no lo lee de Square.';
comment on column recipes.price_set_at is
  'Cuándo se fijó ese PVP. Sirve para "el coste ha subido X% desde el último PVP".';

create unique index recipes_name_key on recipes (lower(name));

create table recipe_lines (
  id                  uuid primary key default gen_random_uuid(),
  recipe_id           uuid not null references recipes (id) on delete cascade,
  product_id          uuid references products (id) on delete set null, -- null = sin mapear
  raw_ingredient_name text not null,   -- nombre original del Excel, se conserva SIEMPRE
  qty                 numeric(12,6) not null check (qty > 0),
  unit                unidad_base not null,
  waste_pct           numeric(5,2) not null default 0
                        check (waste_pct >= 0 and waste_pct < 100),
  mapping_status      estado_mapeo not null default 'sin_mapear',
  created_at          timestamptz not null default now()
);

comment on column recipe_lines.raw_ingredient_name is
  'Texto tal cual venía del Excel. Nunca se sobrescribe al mapear: es la trazabilidad '
  'de por qué una línea apunta a un producto (MISE-008).';
comment on column recipe_lines.waste_pct is
  'Merma. Coste = qty / (1 - waste_pct/100): para servir 1 kg de fruta pelada con un '
  '20% de merma hay que comprar 1,25 kg.';

create index recipe_lines_recipe_idx on recipe_lines (recipe_id);
create index recipe_lines_product_idx on recipe_lines (product_id);
create index recipe_lines_mapping_idx on recipe_lines (mapping_status)
  where mapping_status <> 'mapeado';

-- La consistencia entre product_id y mapping_status no se deja al criterio de quien
-- escriba: si hay producto está mapeado, y si no lo hay no puede estarlo.
alter table recipe_lines add constraint recipe_lines_mapeo_coherente check (
  (product_id is not null and mapping_status = 'mapeado')
  or (product_id is null and mapping_status in ('ambiguo', 'sin_mapear'))
);

create table recipe_cost_snapshots (
  id             uuid primary key default gen_random_uuid(),
  recipe_id      uuid not null references recipes (id) on delete cascade,
  cost_total     numeric(12,4) not null,      -- coste del rendimiento completo
  cost_per_yield numeric(12,4) not null,      -- coste por ración
  is_real        boolean not null default false, -- true si TODO precio viene de recepción
  calculated_at  timestamptz not null default now(),
  trigger        disparador_coste not null
);

create index recipe_cost_snapshots_recipe_idx
  on recipe_cost_snapshots (recipe_id, calculated_at desc);

-- ── Ajustes del operador (MISE-006) ──────────────────────────────────────────

create table settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

insert into settings (key, value) values
  ('price_deviation_threshold_pct', '5'::jsonb),
  ('cost_increase_alert_pct',       '10'::jsonb),
  ('reminder_hours_encargado',      '2'::jsonb),
  ('reminder_hours_barista',        '4'::jsonb);

-- ── Infraestructura de avisos (MISE-004) ─────────────────────────────────────

create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

create table reminder_log (
  id           uuid primary key default gen_random_uuid(),
  supplier_id  uuid not null references suppliers (id) on delete cascade,
  audience     rol_usuario not null,
  sent_on      date not null,
  sent_at      timestamptz not null default now(),
  unique (supplier_id, audience, sent_on)   -- nunca más de un aviso por proveedor y día
);

-- ── updated_at automático ────────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger requests_touch_updated_at
  before update on requests
  for each row execute function public.touch_updated_at();
