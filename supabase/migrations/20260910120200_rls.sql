-- ─────────────────────────────────────────────────────────────────────────────
-- Ergobox v1 — Row Level Security
--
-- Esta es la frontera de seguridad del producto. Las comprobaciones de rol en las
-- páginas son cosmética: evitan enseñar una pantalla que saldría vacía, nada más.
-- Lo que impide que el dueño de un box vea el parque y el trabajo de otro box es
-- exclusivamente lo que hay en este fichero.
--
-- Reparto:
--   admin    → todo, incluido dar de alta boxes y usuarios.
--   tecnico  → todo el trabajo de campo: parque, servicios, partes, fotos.
--              No administra usuarios ni da de alta boxes.
--   cliente  → SOLO LECTURA y solo de su propio box. Ninguna política de
--              escritura lo incluye, en ninguna tabla.
--
-- Las funciones auxiliares son SECURITY DEFINER a propósito: si una política de
-- `perfiles` consultara `perfiles` con RLS activa, la evaluación sería recursiva.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.auth_rol()
returns rol_usuario
language sql stable security definer
set search_path = public, pg_temp
as $$ select rol from public.perfiles where id = auth.uid() and activo $$;

create or replace function public.auth_cliente()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$ select cliente_id from public.perfiles where id = auth.uid() and activo $$;

create or replace function public.es_admin()
returns boolean
language sql stable
set search_path = public, pg_temp
as $$ select public.auth_rol() = 'admin' $$;

-- "Interno" = quien trabaja en Ergo Box: admin o técnico. Es la línea que separa
-- a quien produce el dato de quien solo lo consulta.
create or replace function public.es_interno()
returns boolean
language sql stable
set search_path = public, pg_temp
as $$ select public.auth_rol() in ('admin', 'tecnico') $$;

-- La regla de aislamiento, en un solo sitio. Un cliente sin box asignado devuelve
-- false para todo: falla cerrado, que es como tiene que fallar.
create or replace function public.alcanza_cliente(p_cliente_id uuid)
returns boolean
language sql stable
set search_path = public, pg_temp
as $$
  select case
    when public.auth_rol() in ('admin', 'tecnico') then true
    when public.auth_rol() = 'cliente' then
      p_cliente_id is not null and p_cliente_id = public.auth_cliente()
    else false
  end
$$;

alter table clientes           enable row level security;
alter table perfiles           enable row level security;
alter table maquinas           enable row level security;
alter table servicios          enable row level security;
alter table partes             enable row level security;
alter table fotos              enable row level security;
alter table eventos_maquina    enable row level security;
alter table push_subscriptions enable row level security;
alter table aviso_log          enable row level security;
alter table ajustes            enable row level security;

-- ── clientes ─────────────────────────────────────────────────────────────────

create policy clientes_select on clientes
  for select to authenticated
  using (public.alcanza_cliente(id));

create policy clientes_write on clientes
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ── perfiles ─────────────────────────────────────────────────────────────────

create policy perfiles_select_propio on perfiles
  for select to authenticated
  using (id = auth.uid());

-- Un técnico necesita saber quién firmó cada parte. No ve más que nombre y rol.
create policy perfiles_select_interno on perfiles
  for select to authenticated
  using (public.es_interno());

create policy perfiles_update_propio on perfiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- Nadie se auto-asciende ni se auto-asigna un box.
    and rol = (select p.rol from public.perfiles p where p.id = auth.uid())
    and cliente_id is not distinct from
        (select p.cliente_id from public.perfiles p where p.id = auth.uid())
  );

create policy perfiles_admin on perfiles
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ── maquinas ─────────────────────────────────────────────────────────────────

create policy maquinas_select on maquinas
  for select to authenticated
  using (public.alcanza_cliente(cliente_id));

create policy maquinas_write on maquinas
  for all to authenticated
  using (public.es_interno()) with check (public.es_interno());

-- ── servicios ────────────────────────────────────────────────────────────────

create policy servicios_select on servicios
  for select to authenticated
  using (public.alcanza_cliente(cliente_id));

create policy servicios_write on servicios
  for all to authenticated
  using (public.es_interno()) with check (public.es_interno());

-- ── partes ───────────────────────────────────────────────────────────────────

create policy partes_select on partes
  for select to authenticated
  using (exists (
    select 1 from servicios s
    where s.id = partes.servicio_id and public.alcanza_cliente(s.cliente_id)
  ));

create policy partes_write on partes
  for all to authenticated
  using (public.es_interno()) with check (public.es_interno());

-- ── fotos ────────────────────────────────────────────────────────────────────

create policy fotos_select on fotos
  for select to authenticated
  using (exists (
    select 1 from partes p
    join servicios s on s.id = p.servicio_id
    where p.id = fotos.parte_id and public.alcanza_cliente(s.cliente_id)
  ));

create policy fotos_write on fotos
  for all to authenticated
  using (public.es_interno()) with check (public.es_interno());

-- ── eventos_maquina ──────────────────────────────────────────────────────────
-- El histórico que ve el cliente. Los eventos de servicio los escriben triggers
-- con SECURITY DEFINER; la política de escritura existe para las anotaciones a
-- mano ("llegó con óxido de fábrica"), que solo hace un interno.

create policy eventos_select on eventos_maquina
  for select to authenticated
  using (exists (
    select 1 from maquinas m
    where m.id = eventos_maquina.maquina_id and public.alcanza_cliente(m.cliente_id)
  ));

create policy eventos_write on eventos_maquina
  for all to authenticated
  using (public.es_interno()) with check (public.es_interno());

-- ── push_subscriptions ───────────────────────────────────────────────────────

create policy push_propio on push_subscriptions
  for all to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

-- ── aviso_log ────────────────────────────────────────────────────────────────
-- Sin políticas a propósito: solo lo toca el cron con la service role key.

-- ── ajustes ──────────────────────────────────────────────────────────────────

create policy ajustes_select on ajustes
  for select to authenticated
  using (public.es_interno());

create policy ajustes_write on ajustes
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ── Permisos base ────────────────────────────────────────────────────────────
-- Sin GRANT no hay RLS que valga: la política filtra filas, el grant abre la
-- puerta. Y al revés: el grant es de tabla, no de rol de aplicación, así que lo
-- que impide escribir a un `cliente` no es esta lista sino que ninguna política
-- de escritura lo admite.

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on
  clientes, perfiles, maquinas, servicios, partes, fotos, eventos_maquina,
  push_subscriptions, ajustes
  to authenticated;

revoke all on aviso_log from authenticated;

grant execute on function
  public.auth_rol(), public.auth_cliente(), public.es_admin(),
  public.es_interno(), public.alcanza_cliente(uuid)
  to authenticated;
