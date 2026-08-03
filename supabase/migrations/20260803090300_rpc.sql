-- ─────────────────────────────────────────────────────────────────────────────
-- Mise v1 — operaciones compuestas (RPC)
--
-- Todo lo que toca varias tablas y no puede quedar a medias vive aquí. Son
-- SECURITY INVOKER: se ejecutan con los permisos de quien llama, así que la RLS
-- del fichero anterior sigue mandando. Lo que aportan es atomicidad, no privilegio.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── MISE-001: registrar una falta ────────────────────────────────────────────
-- Cantidad ABSOLUTA, no incremento. Es lo que hace que la cola offline se pueda
-- reintentar sin miedo: repetir "pon 3" dos veces deja 3, repetir "+1" deja 4.

create or replace function public.set_request_qty(
  p_product_id  uuid,
  p_qty         numeric,
  p_location_id uuid default null,
  p_note        text default null
)
returns table (
  request_id      uuid,
  my_qty          numeric,
  location_qty    numeric
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_location uuid := coalesce(p_location_id, public.auth_location());
  v_today    date := (now() at time zone 'Europe/Madrid')::date;
  v_id       uuid;
begin
  if v_location is null then
    raise exception 'Falta el local: un operador debe indicar para qué local pide';
  end if;
  if p_qty < 0 then
    raise exception 'La cantidad no puede ser negativa';
  end if;

  select r.id into v_id
  from requests r
  where r.product_id = p_product_id
    and r.location_id = v_location
    and r.requested_by = auth.uid()
    and r.status = 'pendiente'
    and r.order_id is null
    and (r.created_at at time zone 'Europe/Madrid')::date = v_today
  limit 1;

  if p_qty = 0 then
    if v_id is not null then
      delete from requests where id = v_id;
      v_id := null;
    end if;
  elsif v_id is null then
    insert into requests (location_id, product_id, qty, note, requested_by, status)
    values (v_location, p_product_id, p_qty, p_note, auth.uid(), 'pendiente')
    returning id into v_id;
  else
    update requests
       set qty = p_qty,
           note = coalesce(p_note, note)
     where id = v_id;
  end if;

  return query
  select
    v_id,
    coalesce((select r.qty from requests r where r.id = v_id), 0)::numeric,
    coalesce((
      select sum(r.qty) from requests r
      where r.product_id = p_product_id
        and r.location_id = v_location
        and r.status = 'pendiente'
        and r.order_id is null
    ), 0)::numeric;
end;
$$;

-- ── MISE-002: qué hay pendiente, por proveedor ───────────────────────────────
-- "Pendiente" = solicitado y todavía no metido en ningún borrador. Una línea que
-- el encargado excluye de un pedido vuelve a caer aquí sola.

create view pending_by_supplier
with (security_invoker = true) as
select
  s.id                                        as supplier_id,
  s.name                                      as supplier_name,
  s.contact_channel,
  s.active,
  count(distinct r.product_id)                as line_count,
  count(r.id)                                 as request_count,
  sum(r.qty * coalesce(p.last_known_price, 0)) as estimated_amount,
  bool_or(p.last_known_price is null)          as has_products_without_price,
  min(r.created_at)                            as oldest_request_at
from suppliers s
join products p on p.supplier_id = s.id
join requests r on r.product_id = p.id
where r.status = 'pendiente' and r.order_id is null
group by s.id, s.name, s.contact_channel, s.active;

comment on view pending_by_supplier is
  'Bandeja de /pedidos. estimated_amount usa last_known_price: es una estimación y '
  'la interfaz la etiqueta como tal (MISE-002).';

-- Detalle de lo pendiente, con desglose por local y autoría.
create view pending_request_lines
with (security_invoker = true) as
select
  r.id            as request_id,
  r.product_id,
  p.name          as product_name,
  p.category,
  p.order_unit,
  p.last_known_price,
  p.supplier_id,
  r.location_id,
  l.name          as location_name,
  r.qty,
  r.note,
  r.requested_by,
  pr.full_name    as requested_by_name,
  r.created_at
from requests r
join products p  on p.id = r.product_id
join locations l on l.id = r.location_id
left join profiles pr on pr.id = r.requested_by
where r.status = 'pendiente' and r.order_id is null;

-- ── MISE-002: construir el borrador ──────────────────────────────────────────

-- Suma dos mapas {local: cantidad}. El operador `||` de jsonb pisa las claves
-- repetidas, que al reagrupar un pedido significaría perder lo pedido antes.
create or replace function public.jsonb_sum_numeric(a jsonb, b jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    jsonb_object_agg(clave, total),
    '{}'::jsonb
  )
  from (
    select clave, sum(valor::numeric) as total
    from (
      select key as clave, value as valor from jsonb_each_text(coalesce(a, '{}'::jsonb))
      union all
      select key, value from jsonb_each_text(coalesce(b, '{}'::jsonb))
    ) t
    group by clave
  ) s
$$;

create or replace function public.build_draft_order(p_supplier_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_rec      record;
begin
  if not public.is_gestor() then
    raise exception 'Solo un encargado u operador puede preparar pedidos';
  end if;

  -- Un proveedor tiene como mucho un borrador abierto. Dos borradores del mismo
  -- proveedor acabarían en dos WhatsApps y en pedir dos veces lo mismo.
  select o.id into v_order_id
  from orders o
  where o.supplier_id = p_supplier_id and o.status = 'borrador'
  order by o.created_at desc
  limit 1;

  if v_order_id is null then
    insert into orders (supplier_id, status, channel, created_by)
    select p_supplier_id, 'borrador', s.contact_channel, auth.uid()
    from suppliers s where s.id = p_supplier_id
    returning id into v_order_id;
  end if;

  for v_rec in
    -- Dos agrupaciones: primero por (producto, local) para el desglose, y encima
    -- por producto para el total. En un solo group by el desglose saldría
    -- multiplicado por el número de solicitudes.
    with por_local as (
      select r.product_id, r.location_id, sum(r.qty) as qty
      from requests r
      join products p on p.id = r.product_id
      where p.supplier_id = p_supplier_id
        and r.status = 'pendiente'
        and r.order_id is null
      group by r.product_id, r.location_id
    )
    select
      pl.product_id,
      sum(pl.qty)                                        as qty_total,
      jsonb_object_agg(pl.location_id::text, pl.qty)     as qty_by_location
    from por_local pl
    group by pl.product_id
  loop
    insert into order_lines
      (order_id, product_id, qty_total, qty_by_location, unit_price_expected)
    select
      v_order_id, v_rec.product_id, v_rec.qty_total, v_rec.qty_by_location,
      p.last_known_price
    from products p where p.id = v_rec.product_id
    on conflict (order_id, product_id) do update
      set qty_total       = order_lines.qty_total + excluded.qty_total,
          qty_by_location = public.jsonb_sum_numeric(
                              order_lines.qty_by_location, excluded.qty_by_location);
  end loop;

  -- Enganchadas al borrador, pero todavía 'pendiente': solo el envío las cierra.
  update requests r
     set order_id = v_order_id
    from products p
   where p.id = r.product_id
     and p.supplier_id = p_supplier_id
     and r.status = 'pendiente'
     and r.order_id is null;

  return v_order_id;
end;
$$;

-- ── MISE-002: excluir una línea ──────────────────────────────────────────────
-- No se pierde: vuelve a la bandeja y entra en el siguiente pedido.

create or replace function public.exclude_order_line(p_line_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_order_id   uuid;
  v_product_id uuid;
begin
  select ol.order_id, ol.product_id into v_order_id, v_product_id
  from order_lines ol where ol.id = p_line_id;

  if v_order_id is null then
    raise exception 'La línea no existe';
  end if;

  update requests
     set order_id = null
   where order_id = v_order_id
     and product_id = v_product_id
     and status = 'pendiente';

  delete from order_lines where id = p_line_id;
end;
$$;

-- ── MISE-003: marcar como enviado ────────────────────────────────────────────

create or replace function public.send_order(
  p_order_id          uuid,
  p_message           text,
  p_channel           canal_contacto,
  p_expected_delivery date default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status estado_pedido;
  v_lines  int;
begin
  select status into v_status from orders where id = p_order_id for update;

  if v_status is null then
    raise exception 'El pedido no existe';
  end if;
  if v_status <> 'borrador' then
    raise exception 'Este pedido ya se envió el %. Para corregirlo, crea un pedido complementario',
      (select sent_at from orders where id = p_order_id);
  end if;

  select count(*) into v_lines from order_lines where order_id = p_order_id;
  if v_lines = 0 then
    raise exception 'No se puede enviar un pedido sin líneas';
  end if;

  update orders
     set status            = 'enviado',
         channel           = p_channel,
         message_snapshot  = p_message,
         sent_by           = auth.uid(),
         sent_at           = now(),
         expected_delivery = p_expected_delivery
   where id = p_order_id;

  update requests
     set status = 'en_pedido'
   where order_id = p_order_id and status = 'pendiente';
end;
$$;

-- ── MISE-003: pedido complementario ──────────────────────────────────────────
-- Lo enviado es inmutable. Corregir no es editar: es mandar otro pedido que
-- apunta al primero.

create or replace function public.create_complement_order(p_order_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_new_id uuid;
begin
  if not public.is_gestor() then
    raise exception 'Solo un encargado u operador puede crear pedidos';
  end if;

  insert into orders (supplier_id, status, channel, supersedes_id, created_by)
  select o.supplier_id, 'borrador', o.channel, o.id, auth.uid()
  from orders o
  where o.id = p_order_id and o.status <> 'borrador'
  returning id into v_new_id;

  if v_new_id is null then
    raise exception 'Solo se complementa un pedido ya enviado';
  end if;

  return v_new_id;
end;
$$;

-- ── MISE-005: "todo correcto" de un toque ────────────────────────────────────

create or replace function public.receive_order_complete(
  p_order_id    uuid,
  p_location_id uuid,
  p_doc_ref     text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_receipt_id uuid;
begin
  insert into receipts (order_id, location_id, received_by, doc_ref, closed)
  values (p_order_id, p_location_id, auth.uid(), p_doc_ref, true)
  returning id into v_receipt_id;

  -- Cada local confirma lo suyo. Si la línea no trae desglose (la añadió el
  -- encargado a mano), se atribuye entera al local que recepciona.
  insert into receipt_lines (receipt_id, product_id, qty_received, incidence)
  select
    v_receipt_id,
    ol.product_id,
    case
      when ol.qty_by_location ? p_location_id::text
        then (ol.qty_by_location ->> p_location_id::text)::numeric
      when ol.qty_by_location = '{}'::jsonb then ol.qty_total
      else 0
    end,
    'ninguna'
  from order_lines ol
  where ol.order_id = p_order_id
    and (ol.qty_by_location ? p_location_id::text or ol.qty_by_location = '{}'::jsonb);

  return v_receipt_id;
end;
$$;

-- ── MISE-008: emparejar ingrediente con producto ─────────────────────────────
-- Similitud trigram sobre el catálogo. Devuelve candidatos ORDENADOS, nunca
-- decide: quien mapea es una persona en la pantalla de resolución.

create or replace function public.match_ingredient(
  p_name  text,
  p_limit int default 5
)
returns table (
  product_id   uuid,
  product_name text,
  supplier_name text,
  base_unit    unidad_base,
  order_unit   text,
  score        real
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select p.id, p.name, s.name, p.base_unit, p.order_unit,
         similarity(p.name, p_name) as score
  from products p
  join suppliers s on s.id = p.supplier_id
  where p.active and similarity(p.name, p_name) > 0.2
  order by score desc, p.name
  limit greatest(p_limit, 1)
$$;

-- ── MISE-009: simulador de subida de precio ──────────────────────────────────
-- "Si este producto sube un Y%, ¿a qué elaboraciones les pega y cuánto?"

create or replace function public.simulate_price_change(
  p_product_id uuid,
  p_pct        numeric
)
returns table (
  recipe_id          uuid,
  recipe_name        text,
  current_cost       numeric,
  simulated_cost     numeric,
  cost_delta_pct     numeric,
  current_price      numeric,
  current_margin_pct numeric,
  simulated_margin_pct numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with impacto as (
    select
      rl.recipe_id,
      -- Solo la parte del coste que aporta ESTE producto se mueve.
      sum((rl.qty / (1 - rl.waste_pct / 100.0)) * pcp.unit_cost_base * (p_pct / 100.0))
        as delta
    from recipe_lines rl
    join product_current_price pcp on pcp.product_id = rl.product_id
    where rl.product_id = p_product_id
    group by rl.recipe_id
  )
  select
    rcc.recipe_id,
    rcc.name,
    round(rcc.cost_per_yield, 4),
    round(rcc.cost_per_yield + i.delta / rcc.yield_qty, 4),
    case when rcc.cost_per_yield = 0 then null
         else round(100.0 * (i.delta / rcc.yield_qty) / rcc.cost_per_yield, 2) end,
    rcc.current_price,
    rcc.margin_pct,
    case when rcc.current_price is null or rcc.current_price = 0 then null
         else round(100.0 * (rcc.current_price - (rcc.cost_per_yield + i.delta / rcc.yield_qty))
                    / rcc.current_price, 1) end
  from impacto i
  join recipe_current_cost rcc on rcc.recipe_id = i.recipe_id
  where rcc.cost_per_yield is not null and not rcc.has_gaps
  order by 5 desc nulls last
$$;

grant execute on function
  public.set_request_qty(uuid, numeric, uuid, text),
  public.build_draft_order(uuid),
  public.exclude_order_line(uuid),
  public.send_order(uuid, text, canal_contacto, date),
  public.create_complement_order(uuid),
  public.receive_order_complete(uuid, uuid, text),
  public.match_ingredient(text, int),
  public.simulate_price_change(uuid, numeric)
  to authenticated;
