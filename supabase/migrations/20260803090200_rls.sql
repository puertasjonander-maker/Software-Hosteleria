-- ─────────────────────────────────────────────────────────────────────────────
-- Mise v1 — Row Level Security
-- BUILD_SPEC.md §1 "Políticas RLS" · regla 2: RLS desde el primer commit.
--
-- Reparto de permisos:
--   barista   → catálogo activo; sus solicitudes y las de SU local; pedidos de
--               proveedores que sirven a su local; puede recepcionar en su local.
--   encargado → lo anterior en los tres locales + crear/editar/enviar pedidos.
--   operador  → lectura total + administración de catálogo y usuarios.
--
-- Las funciones auxiliares son SECURITY DEFINER a propósito: si una política de
-- `profiles` consultara `profiles` con RLS activa, la evaluación sería recursiva.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.auth_role()
returns rol_usuario
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.auth_location()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select location_id from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_operador()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$ select public.auth_role() = 'operador' $$;

-- "Gestor" = quien puede mover pedidos: encargado y operador.
create or replace function public.is_gestor()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$ select public.auth_role() in ('encargado', 'operador') $$;

-- Un barista solo alcanza su local; encargado y operador alcanzan los tres.
create or replace function public.can_reach_location(p_location_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when public.auth_role() in ('encargado', 'operador') then true
    when public.auth_role() = 'barista' then p_location_id = public.auth_location()
    else false
  end
$$;

-- ¿Este proveedor sirve al local del usuario? Define qué pedidos ve un barista.
create or replace function public.supplier_serves_my_location(p_supplier_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when public.auth_role() in ('encargado', 'operador') then true
    when public.auth_role() = 'barista' then exists (
      select 1
      from public.location_products lp
      join public.products p on p.id = lp.product_id
      where lp.location_id = public.auth_location()
        and lp.active
        and p.supplier_id = p_supplier_id
    )
    else false
  end
$$;

alter table locations            enable row level security;
alter table profiles             enable row level security;
alter table suppliers            enable row level security;
alter table supplier_schedules   enable row level security;
alter table products             enable row level security;
alter table location_products    enable row level security;
alter table requests             enable row level security;
alter table orders               enable row level security;
alter table order_lines          enable row level security;
alter table receipts             enable row level security;
alter table receipt_lines        enable row level security;
alter table price_history        enable row level security;
alter table recipes              enable row level security;
alter table recipe_lines         enable row level security;
alter table recipe_cost_snapshots enable row level security;
alter table settings             enable row level security;
alter table push_subscriptions   enable row level security;
alter table reminder_log         enable row level security;

-- ── locations ────────────────────────────────────────────────────────────────

create policy locations_select on locations
  for select to authenticated
  using (public.auth_role() is not null);

create policy locations_write on locations
  for all to authenticated
  using (public.is_operador()) with check (public.is_operador());

-- ── profiles ─────────────────────────────────────────────────────────────────

create policy profiles_select_own on profiles
  for select to authenticated
  using (id = auth.uid());

-- Un encargado necesita saber quién pidió cada línea (MISE-002); el operador
-- administra usuarios. Ninguno de los dos ve más que nombre, rol y local.
create policy profiles_select_gestor on profiles
  for select to authenticated
  using (public.is_gestor());

create policy profiles_update_own_name on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- Nadie se auto-asciende: rol y local solo los cambia el operador.
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and location_id is not distinct from
        (select p.location_id from public.profiles p where p.id = auth.uid())
  );

create policy profiles_admin on profiles
  for all to authenticated
  using (public.is_operador()) with check (public.is_operador());

-- ── suppliers / supplier_schedules ───────────────────────────────────────────

create policy suppliers_select on suppliers
  for select to authenticated
  using (
    public.is_gestor()
    or (active and public.supplier_serves_my_location(id))
  );

create policy suppliers_write on suppliers
  for all to authenticated
  using (public.is_operador()) with check (public.is_operador());

create policy supplier_schedules_select on supplier_schedules
  for select to authenticated
  using (public.is_gestor() or public.supplier_serves_my_location(supplier_id));

create policy supplier_schedules_write on supplier_schedules
  for all to authenticated
  using (public.is_operador()) with check (public.is_operador());

-- ── products / location_products ─────────────────────────────────────────────

create policy products_select on products
  for select to authenticated
  using (
    public.is_gestor()
    or (
      active and exists (
        select 1 from location_products lp
        where lp.product_id = products.id
          and lp.location_id = public.auth_location()
          and lp.active
      )
    )
  );

create policy products_write on products
  for all to authenticated
  using (public.is_operador()) with check (public.is_operador());

create policy location_products_select on location_products
  for select to authenticated
  using (public.can_reach_location(location_id));

create policy location_products_write on location_products
  for all to authenticated
  using (public.is_operador()) with check (public.is_operador());

-- ── requests ─────────────────────────────────────────────────────────────────

create policy requests_select on requests
  for select to authenticated
  using (public.can_reach_location(location_id));

create policy requests_insert on requests
  for insert to authenticated
  with check (
    public.can_reach_location(location_id)
    and requested_by = auth.uid()
    and status = 'pendiente'
  );

-- Corregir una solicitud sí; tocar una que ya salió en un pedido, no. Lo que se
-- envió al proveedor no se reescribe desde el móvil.
create policy requests_update on requests
  for update to authenticated
  using (
    public.can_reach_location(location_id)
    and (public.is_gestor() or (requested_by = auth.uid() and status = 'pendiente'))
  )
  with check (public.can_reach_location(location_id));

create policy requests_delete on requests
  for delete to authenticated
  using (
    status = 'pendiente'
    and public.can_reach_location(location_id)
    and (public.is_gestor() or requested_by = auth.uid())
  );

-- ── orders / order_lines ─────────────────────────────────────────────────────

create policy orders_select on orders
  for select to authenticated
  using (public.supplier_serves_my_location(supplier_id));

create policy orders_insert on orders
  for insert to authenticated
  with check (public.is_gestor());

-- Un pedido enviado es inmutable (MISE-003). La única transición permitida sobre
-- él es la de estado, que la hacen los triggers de recepción con SECURITY DEFINER.
create policy orders_update on orders
  for update to authenticated
  using (public.is_gestor() and status = 'borrador')
  with check (public.is_gestor());

create policy orders_delete on orders
  for delete to authenticated
  using (public.is_gestor() and status = 'borrador');

create policy order_lines_select on order_lines
  for select to authenticated
  using (exists (
    select 1 from orders o
    where o.id = order_lines.order_id
      and public.supplier_serves_my_location(o.supplier_id)
  ));

create policy order_lines_write on order_lines
  for all to authenticated
  using (
    public.is_gestor()
    and exists (select 1 from orders o where o.id = order_lines.order_id and o.status = 'borrador')
  )
  with check (
    public.is_gestor()
    and exists (select 1 from orders o where o.id = order_lines.order_id and o.status = 'borrador')
  );

-- ── receipts / receipt_lines ─────────────────────────────────────────────────
-- Recepcionar es tarea de quien está en la puerta cuando llega el camión: el
-- barista puede hacerlo, pero solo para su local (MISE-005).

create policy receipts_select on receipts
  for select to authenticated
  using (public.can_reach_location(location_id));

create policy receipts_insert on receipts
  for insert to authenticated
  with check (
    public.can_reach_location(location_id)
    and received_by = auth.uid()
    and exists (
      select 1 from orders o
      where o.id = receipts.order_id and o.status <> 'borrador'
    )
  );

create policy receipts_update on receipts
  for update to authenticated
  using (public.can_reach_location(location_id) and (public.is_gestor() or not closed))
  with check (public.can_reach_location(location_id));

create policy receipt_lines_select on receipt_lines
  for select to authenticated
  using (exists (
    select 1 from receipts r
    where r.id = receipt_lines.receipt_id and public.can_reach_location(r.location_id)
  ));

create policy receipt_lines_write on receipt_lines
  for all to authenticated
  using (exists (
    select 1 from receipts r
    where r.id = receipt_lines.receipt_id
      and public.can_reach_location(r.location_id)
      and (public.is_gestor() or not r.closed)
  ))
  with check (exists (
    select 1 from receipts r
    where r.id = receipt_lines.receipt_id
      and public.can_reach_location(r.location_id)
      and (public.is_gestor() or not r.closed)
  ));

-- ── price_history ────────────────────────────────────────────────────────────

create policy price_history_select on price_history
  for select to authenticated
  using (public.is_gestor());

create policy price_history_insert_manual on price_history
  for insert to authenticated
  with check (public.is_operador() and source = 'manual');

-- ── Escandallo ───────────────────────────────────────────────────────────────

create policy recipes_select on recipes
  for select to authenticated
  using (public.is_gestor());

create policy recipes_write on recipes
  for all to authenticated
  using (public.is_operador()) with check (public.is_operador());

create policy recipe_lines_select on recipe_lines
  for select to authenticated
  using (public.is_gestor());

create policy recipe_lines_write on recipe_lines
  for all to authenticated
  using (public.is_operador()) with check (public.is_operador());

create policy recipe_cost_snapshots_select on recipe_cost_snapshots
  for select to authenticated
  using (public.is_gestor());

-- Los snapshots los escriben los triggers (SECURITY DEFINER). Sin política de
-- escritura: nadie los teclea a mano.

-- ── settings ─────────────────────────────────────────────────────────────────

create policy settings_select on settings
  for select to authenticated
  using (public.auth_role() is not null);

create policy settings_write on settings
  for all to authenticated
  using (public.is_operador()) with check (public.is_operador());

-- ── push_subscriptions ───────────────────────────────────────────────────────

create policy push_subscriptions_own on push_subscriptions
  for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ── reminder_log ─────────────────────────────────────────────────────────────
-- Sin políticas a propósito: solo lo toca el cron con la service role key.

-- ── Permisos base ────────────────────────────────────────────────────────────
-- Sin GRANT no hay RLS que valga: la política filtra filas, el grant abre la puerta.

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on
  requests, orders, order_lines, receipts, receipt_lines, price_history,
  recipes, recipe_lines, products, suppliers, supplier_schedules, locations,
  location_products, profiles, settings, push_subscriptions
  to authenticated;

revoke all on reminder_log from authenticated;

grant execute on function
  public.auth_role(), public.auth_location(), public.is_operador(),
  public.is_gestor(), public.can_reach_location(uuid),
  public.supplier_serves_my_location(uuid)
  to authenticated;
