-- ─────────────────────────────────────────────────────────────────────────────
-- Lo mínimo de Supabase para poder ejecutar las migraciones contra un PostgreSQL
-- pelado y probar las políticas sin levantar nada.
--
-- NO reproduce Supabase: no hay GoTrue, ni PostgREST, ni el servicio de Storage.
-- Reproduce exactamente las tres cosas de las que dependen nuestras migraciones —
-- los roles, `auth.users` con su trigger, y `auth.uid()` — y la tabla de objetos
-- del bucket, que es contra la que se escribe la política de las fotos.
--
-- `auth.uid()` lee aquí un GUC que la prueba fija a mano. En Supabase lo rellena
-- PostgREST desde el JWT; el resultado para una política es idéntico.
--
-- Uso:
--   createdb ergobox
--   psql -d ergobox -f scripts/supabase-stub.sql
--   for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d ergobox -f "$f"; done
--   psql -v ON_ERROR_STOP=1 -d ergobox -f scripts/probar-aislamiento.sql
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- Los roles son del clúster y no de la base, así que sobreviven a un `dropdb`.
-- Se crean solo si faltan para poder rehacer la base de prueba tantas veces como
-- haga falta.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;
create schema if not exists storage;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text
);

alter table storage.objects enable row level security;

-- Los mismos permisos base que trae Supabase: el esquema abierto y la tabla
-- concedida, con la RLS decidiendo qué filas. Sin esto la política de las fotos
-- ni se llegaría a evaluar y la prueba daría un falso "no ve nada".
grant usage on schema auth, storage to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
