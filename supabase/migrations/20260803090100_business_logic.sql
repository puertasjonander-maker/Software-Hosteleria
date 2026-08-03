-- ─────────────────────────────────────────────────────────────────────────────
-- Mise v1 — lógica de negocio en base de datos
--
-- Vive aquí, y no en la aplicación, todo lo que tiene que ser cierto pase lo que
-- pase: procedencia del precio, estado del pedido tras una recepción y coste de
-- elaboración. Son invariantes, no pantallas.
--
-- Las vistas se declaran `security_invoker = true` para que respeten la RLS del
-- usuario que consulta. Sin eso, una vista se ejecutaría con los permisos de su
-- propietario y sería un agujero por el que un barista vería los tres locales.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Precio vigente por producto ──────────────────────────────────────────────
-- Procedencia explícita (CONTEXT.md §7): 'real' solo si el último dato viene de
-- una recepción. Un precio del Excel es 'estimado' aunque sea de esta mañana.

create view product_current_price
with (security_invoker = true) as
select
  p.id                                   as product_id,
  p.supplier_id,
  p.base_unit,
  p.units_per_order_unit,
  coalesce(ph.price, p.last_known_price)  as price_per_order_unit,
  case
    when ph.price is not null and ph.source = 'recepcion' then 'real'
    when ph.price is not null                             then 'estimado'
    when p.last_known_price is not null                   then 'estimado'
    else 'sin_dato'
  end                                     as price_kind,
  case
    when coalesce(ph.price, p.last_known_price) is null then null
    else coalesce(ph.price, p.last_known_price) / p.units_per_order_unit
  end                                     as unit_cost_base,
  ph.effective_date                       as price_date
from products p
left join lateral (
  select h.price, h.source, h.effective_date
  from price_history h
  where h.product_id = p.id
  order by h.effective_date desc, h.created_at desc
  limit 1
) ph on true;

comment on view product_current_price is
  'Precio vigente por order_unit y coste por unidad base, con su procedencia. '
  'unit_cost_base es lo que consume el escandallo.';

-- ── Recepción → price_history ────────────────────────────────────────────────
-- Cada precio introducido en una recepción escribe histórico (MISE-005) y
-- actualiza el último precio conocido del producto.

create or replace function public.sync_price_from_receipt_line()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_effective date;
begin
  -- Reescribimos siempre: si el encargado corrige el precio de una línea, el
  -- histórico refleja la corrección en vez de acumular dos verdades.
  delete from price_history where receipt_line_id = new.id;

  if new.unit_price_actual is null then
    return new;
  end if;

  select (r.received_at at time zone 'Europe/Madrid')::date
    into v_effective
  from receipts r
  where r.id = new.receipt_id;

  insert into price_history (product_id, price, source, effective_date, receipt_line_id)
  values (new.product_id, new.unit_price_actual, 'recepcion',
          coalesce(v_effective, current_date), new.id);

  update products
     set last_known_price = new.unit_price_actual
   where id = new.product_id;

  return new;
end;
$$;

create trigger receipt_lines_sync_price
  after insert or update of unit_price_actual, product_id on receipt_lines
  for each row execute function public.sync_price_from_receipt_line();

-- ── Estado del pedido tras recibir ───────────────────────────────────────────

create or replace function public.refresh_order_status(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status         estado_pedido;
  v_any_received   boolean;
  v_open_receipts  boolean;
  v_unresolved     boolean;
begin
  select status into v_status from orders where id = p_order_id;

  -- Un borrador no cambia de estado por recibir: primero se envía.
  if v_status is null or v_status = 'borrador' then
    return;
  end if;

  select exists (
    select 1 from receipts r
    join receipt_lines rl on rl.receipt_id = r.id
    where r.order_id = p_order_id and rl.qty_received > 0
  ) into v_any_received;

  if not v_any_received then
    update orders set status = 'enviado' where id = p_order_id and status <> 'enviado';
    return;
  end if;

  select exists (
    select 1 from receipts r where r.order_id = p_order_id and r.closed = false
  ) into v_open_receipts;

  -- Una línea "sin resolver" es la que llegó corta y nadie ha declarado por qué.
  -- Con incidencia declarada el pedido puede cerrarse: el hueco queda registrado,
  -- que es justo lo que MISE-005 quiere hacer visible.
  select exists (
    select 1
    from order_lines ol
    left join lateral (
      select coalesce(sum(rl.qty_received), 0) as recibido,
             bool_or(rl.incidence <> 'ninguna') as con_incidencia
      from receipts r
      join receipt_lines rl on rl.receipt_id = r.id
      where r.order_id = p_order_id and rl.product_id = ol.product_id
    ) rec on true
    where ol.order_id = p_order_id
      and rec.recibido < ol.qty_total
      and coalesce(rec.con_incidencia, false) = false
  ) into v_unresolved;

  if v_open_receipts or v_unresolved then
    update orders set status = 'recibido_parcial'
     where id = p_order_id and status <> 'recibido_parcial';
  else
    update orders set status = 'cerrado'
     where id = p_order_id and status <> 'cerrado';
  end if;
end;
$$;

create or replace function public.on_receipt_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row        record;
  v_order_id   uuid;
  v_receipt_id uuid;
begin
  -- En un trigger DELETE, NEW no está asignado: leer NEW.algo reventaría. Se elige
  -- la fila viva una sola vez y a partir de ahí da igual la operación.
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  if tg_table_name = 'receipts' then
    v_order_id := v_row.order_id;
  else
    v_receipt_id := v_row.receipt_id;
    select r.order_id into v_order_id from receipts r where r.id = v_receipt_id;
  end if;

  if v_order_id is not null then
    perform public.refresh_order_status(v_order_id);
  end if;

  return v_row;
end;
$$;

create trigger receipts_refresh_order_status
  after insert or update or delete on receipts
  for each row execute function public.on_receipt_change();

create trigger receipt_lines_refresh_order_status
  after insert or update or delete on receipt_lines
  for each row execute function public.on_receipt_change();

-- ── Cobertura del escandallo ─────────────────────────────────────────────────

create view recipe_coverage
with (security_invoker = true) as
select
  r.id                                                          as recipe_id,
  count(rl.id)                                                  as total_lines,
  count(rl.id) filter (where rl.mapping_status = 'mapeado')      as mapped_lines,
  case
    when count(rl.id) = 0 then 0
    else round(
      100.0 * count(rl.id) filter (where rl.mapping_status = 'mapeado') / count(rl.id)
    , 1)
  end                                                           as mapped_pct,
  count(rl.id) = 0
    or count(rl.id) filter (where rl.mapping_status <> 'mapeado') > 0
                                                                as has_gaps
from recipes r
left join recipe_lines rl on rl.recipe_id = r.id
group by r.id;

comment on view recipe_coverage is
  'Una elaboración sin líneas o con líneas sin mapear tiene un hueco, no un coste. '
  'has_gaps es la condición que impide calcular (CONTEXT.md §7).';

-- ── Cálculo de coste de elaboración (MISE-009) ───────────────────────────────

create or replace function public.recalc_recipe_cost(
  p_recipe_id uuid,
  p_trigger   disparador_coste
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_has_gaps    boolean;
  v_lines       int;
  v_incalculable int;
  v_cost        numeric(12,4);
  v_yield       numeric(12,4);
  v_is_real     boolean;
  v_last_cost   numeric(12,4);
  v_last_real   boolean;
begin
  select has_gaps, total_lines into v_has_gaps, v_lines
  from recipe_coverage where recipe_id = p_recipe_id;

  -- Sin mapeo completo no hay coste: hay un hueco. No se inventa un parcial.
  if v_has_gaps is null or v_has_gaps or coalesce(v_lines, 0) = 0 then
    return;
  end if;

  -- Una línea es incalculable si su producto no tiene precio, o si la unidad del
  -- escandallo no es la unidad base del producto (kg vs ud): eso es un error de
  -- mapeo, no algo que convenga resolver con una conversión adivinada.
  select count(*) into v_incalculable
  from recipe_lines rl
  join products p on p.id = rl.product_id
  left join product_current_price pcp on pcp.product_id = rl.product_id
  where rl.recipe_id = p_recipe_id
    and (pcp.unit_cost_base is null or rl.unit <> p.base_unit);

  if v_incalculable > 0 then
    return;
  end if;

  select
    sum((rl.qty / (1 - rl.waste_pct / 100.0)) * pcp.unit_cost_base),
    bool_and(pcp.price_kind = 'real')
  into v_cost, v_is_real
  from recipe_lines rl
  join product_current_price pcp on pcp.product_id = rl.product_id
  where rl.recipe_id = p_recipe_id;

  if v_cost is null then
    return;
  end if;

  select yield_qty into v_yield from recipes where id = p_recipe_id;

  select cost_total, is_real into v_last_cost, v_last_real
  from recipe_cost_snapshots
  where recipe_id = p_recipe_id
  order by calculated_at desc
  limit 1;

  -- Solo se guarda snapshot si algo cambió. Si no, la serie temporal se llenaría
  -- de puntos idénticos y el gráfico de evolución dejaría de decir nada.
  if v_last_cost is not null
     and round(v_last_cost, 4) = round(v_cost, 4)
     and v_last_real is not distinct from v_is_real then
    return;
  end if;

  insert into recipe_cost_snapshots
    (recipe_id, cost_total, cost_per_yield, is_real, trigger)
  values
    (p_recipe_id, round(v_cost, 4), round(v_cost / v_yield, 4), v_is_real, p_trigger);
end;
$$;

-- Recalcular todas las elaboraciones afectadas por un producto.
create or replace function public.recalc_recipes_for_product(
  p_product_id uuid,
  p_trigger    disparador_coste
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipe uuid;
begin
  for v_recipe in
    select distinct rl.recipe_id
    from recipe_lines rl
    join recipes r on r.id = rl.recipe_id
    where rl.product_id = p_product_id and r.active
  loop
    perform public.recalc_recipe_cost(v_recipe, p_trigger);
  end loop;
end;
$$;

create or replace function public.on_price_history_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.recalc_recipes_for_product(
    new.product_id,
    case when new.source = 'recepcion' then 'recepcion'::disparador_coste
         else 'precio_manual'::disparador_coste end
  );
  return new;
end;
$$;

create trigger price_history_recalc_costs
  after insert on price_history
  for each row execute function public.on_price_history_change();

create or replace function public.on_recipe_line_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;
  perform public.recalc_recipe_cost(v_row.recipe_id, 'cambio_receta');
  return v_row;
end;
$$;

create trigger recipe_lines_recalc_cost
  after insert or update or delete on recipe_lines
  for each row execute function public.on_recipe_line_change();

-- ── Coste vigente por elaboración ────────────────────────────────────────────

create view recipe_current_cost
with (security_invoker = true) as
select
  r.id                as recipe_id,
  r.name,
  r.yield_qty,
  r.yield_unit,
  r.current_price,
  r.price_set_at,
  r.active,
  cov.total_lines,
  cov.mapped_lines,
  cov.mapped_pct,
  cov.has_gaps,
  s.cost_total,
  s.cost_per_yield,
  s.is_real,
  s.calculated_at,
  -- El precio más antiguo entre los ingredientes: si es viejo, el coste está
  -- desactualizado por mucho que el snapshot sea de hoy.
  oldest.oldest_price_date,
  case
    when cov.has_gaps                       then 'hueco'
    when s.cost_per_yield is null           then 'sin_datos'
    when s.is_real                          then 'real'
    else                                         'estimado'
  end                 as cost_kind,
  case
    when r.current_price is null or r.current_price = 0 or s.cost_per_yield is null
      then null
    else round(100.0 * (r.current_price - s.cost_per_yield) / r.current_price, 1)
  end                 as margin_pct
from recipes r
left join recipe_coverage cov on cov.recipe_id = r.id
left join lateral (
  select cs.cost_total, cs.cost_per_yield, cs.is_real, cs.calculated_at
  from recipe_cost_snapshots cs
  where cs.recipe_id = r.id
  order by cs.calculated_at desc
  limit 1
) s on true
left join lateral (
  select min(pcp.price_date) as oldest_price_date
  from recipe_lines rl
  join product_current_price pcp on pcp.product_id = rl.product_id
  where rl.recipe_id = r.id
) oldest on true;

comment on view recipe_current_cost is
  'Una fila por elaboración con su coste vigente y su procedencia. cost_kind = '
  'hueco significa que faltan mapeos: la interfaz muestra el hueco, no un número.';

-- ── Desviación de precio en recepción (MISE-006) ─────────────────────────────

create view receipt_price_deviation
with (security_invoker = true) as
select
  rl.id                        as receipt_line_id,
  rl.receipt_id,
  rl.product_id,
  r.order_id,
  rl.unit_price_actual         as price_now,
  prev.price                   as price_before,
  prev.effective_date          as price_before_date,
  case
    when prev.price is null or prev.price = 0 or rl.unit_price_actual is null then null
    else round(100.0 * (rl.unit_price_actual - prev.price) / prev.price, 2)
  end                          as deviation_pct
from receipt_lines rl
join receipts r on r.id = rl.receipt_id
left join lateral (
  select h.price, h.effective_date
  from price_history h
  where h.product_id = rl.product_id
    and (h.receipt_line_id is null or h.receipt_line_id <> rl.id)
    and h.created_at < rl.created_at
  order by h.effective_date desc, h.created_at desc
  limit 1
) prev on true
where rl.unit_price_actual is not null;

-- ── Gasto por recepción (MISE-007) ───────────────────────────────────────────
-- El panel mide lo que ha ENTRADO, no lo que se pidió: el gasto real es lo
-- recibido a su precio real. Si no hay precio real todavía, se usa el estimado y
-- la vista lo dice con price_kind.

create view spend_lines
with (security_invoker = true) as
select
  rl.id                                     as receipt_line_id,
  r.id                                      as receipt_id,
  r.order_id,
  r.location_id,
  (r.received_at at time zone 'Europe/Madrid')::date as spend_date,
  p.id                                      as product_id,
  p.name                                    as product_name,
  p.category,
  p.supplier_id,
  s.name                                    as supplier_name,
  rl.qty_received,
  coalesce(rl.unit_price_actual, p.last_known_price)      as unit_price,
  rl.qty_received * coalesce(rl.unit_price_actual, p.last_known_price) as amount,
  case when rl.unit_price_actual is not null then 'real' else 'estimado' end as price_kind,
  rl.incidence
from receipt_lines rl
join receipts r  on r.id = rl.receipt_id
join products p  on p.id = rl.product_id
join suppliers s on s.id = p.supplier_id
where rl.qty_received > 0;
