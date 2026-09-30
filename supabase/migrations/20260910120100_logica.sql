-- ─────────────────────────────────────────────────────────────────────────────
-- Ergobox v1 — lógica de negocio en la base de datos
--
-- Qué vive aquí y por qué: todo lo que, si se dejara en la aplicación, se podría
-- saltar entrando por otra pantalla. El estado de una máquina y su histórico son
-- justo eso. Un técnico cierra un parte desde el móvil y el semáforo de la
-- máquina tiene que moverse; si eso lo hiciera el cliente de JavaScript, bastaría
-- con perder la cobertura a medias para dejar la ficha mintiendo.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── updated_at automático ────────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger clientes_touch  before update on clientes
  for each row execute function public.touch_updated_at();
create trigger maquinas_touch  before update on maquinas
  for each row execute function public.touch_updated_at();
create trigger servicios_touch before update on servicios
  for each row execute function public.touch_updated_at();
create trigger partes_touch    before update on partes
  for each row execute function public.touch_updated_at();

-- ── Próxima revisión ─────────────────────────────────────────────────────────
-- Derivada, nunca tecleada. Se recalcula cada vez que cambia alguno de sus dos
-- ingredientes. Sin cadencia contratada no hay próxima revisión: el campo se
-- queda a null y la máquina no entra en los avisos.

create or replace function public.calcular_proxima_revision()
returns trigger language plpgsql as $$
begin
  if new.cadencia_meses is null or new.ultima_revision is null then
    new.proxima_revision := null;
  else
    new.proxima_revision := new.ultima_revision + (new.cadencia_meses || ' months')::interval;
  end if;
  return new;
end;
$$;

create trigger maquinas_proxima_revision
  before insert or update of ultima_revision, cadencia_meses on maquinas
  for each row execute function public.calcular_proxima_revision();

-- ── Alta de máquina en el histórico ──────────────────────────────────────────

create or replace function public.registrar_alta_maquina()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.eventos_maquina (maquina_id, tipo, texto, estado_resultante, autor_id)
  values (
    new.id,
    'alta',
    trim(coalesce(new.marca, '') || ' ' || coalesce(new.modelo, '')) ||
      case when new.num_serie is not null then ' · nº ' || new.num_serie else '' end,
    new.estado,
    auth.uid()
  );
  return new;
end;
$$;

create trigger maquinas_alta
  after insert on maquinas
  for each row execute function public.registrar_alta_maquina();

-- ── Cierre de un parte ───────────────────────────────────────────────────────
-- Marcar un parte como hecho es lo que mueve el semáforo de la máquina, fija la
-- fecha de última revisión y escribe la línea del histórico. Es una sola
-- transacción a propósito: o pasan las tres cosas o no pasa ninguna.
--
-- Solo actúa en la transición false → true. Reeditar un parte ya cerrado no
-- vuelve a escribir en el histórico ni reabre la fecha de revisión.

create or replace function public.aplicar_parte_hecho()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_fecha date;
begin
  if new.hecho and not coalesce(old.hecho, false) then
    select fecha into v_fecha from public.servicios where id = new.servicio_id;

    update public.maquinas
       set estado          = coalesce(new.estado_despues, estado),
           ultima_revision = greatest(coalesce(ultima_revision, v_fecha), v_fecha)
     where id = new.maquina_id;

    insert into public.eventos_maquina
      (maquina_id, fecha, tipo, texto, estado_resultante, parte_id, autor_id)
    values (
      new.maquina_id,
      v_fecha,
      'servicio',
      coalesce(nullif(trim(new.trabajo_hecho), ''), 'Servicio realizado'),
      new.estado_despues,
      new.id,
      auth.uid()
    );
  end if;
  return new;
end;
$$;

create trigger partes_aplicar_hecho
  after update of hecho on partes
  for each row execute function public.aplicar_parte_hecho();

-- ── Coherencia del parte ─────────────────────────────────────────────────────
-- Un parte pertenece a un servicio, que pertenece a un cliente. La máquina tiene
-- que ser de ese mismo cliente: sin esta comprobación, un error de la aplicación
-- podría colgar el trabajo de un box de la ficha de una máquina de otro, y la RLS
-- no lo vería porque cada tabla por separado sí sería alcanzable.

create or replace function public.validar_parte()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cliente_servicio uuid;
  v_cliente_maquina  uuid;
begin
  select cliente_id into v_cliente_servicio from public.servicios where id = new.servicio_id;
  select cliente_id into v_cliente_maquina  from public.maquinas  where id = new.maquina_id;

  if v_cliente_servicio is distinct from v_cliente_maquina then
    raise exception 'La máquina % no pertenece al box de este servicio', new.maquina_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger partes_validar
  before insert or update of servicio_id, maquina_id on partes
  for each row execute function public.validar_parte();

-- ── Cierre del servicio ──────────────────────────────────────────────────────
-- Un servicio pasa a `hecho` cuando todos sus partes lo están. Lo calcula la base
-- de datos porque el técnico cierra partes de uno en uno, a veces sin cobertura y
-- en un orden cualquiera, y nadie debería tener que acordarse de cerrar la visita.

create or replace function public.sincronizar_estado_servicio()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  -- En un trigger de borrado NEW no está asignado, así que no se puede leer sin
  -- más: hay que mirar TG_OP antes de tocarlo.
  v_servicio uuid := case when tg_op = 'DELETE' then old.servicio_id else new.servicio_id end;
  v_total    int;
  v_hechos   int;
begin
  select count(*), count(*) filter (where hecho)
    into v_total, v_hechos
    from public.partes where servicio_id = v_servicio;

  update public.servicios
     set estado = case
           when v_total > 0 and v_hechos = v_total then 'hecho'::estado_servicio
           when v_hechos > 0 then 'en_curso'::estado_servicio
           else estado
         end,
         cerrado_at = case
           when v_total > 0 and v_hechos = v_total then coalesce(cerrado_at, now())
           else null
         end
   where id = v_servicio
     and estado <> 'cancelado';

  return null;
end;
$$;

create trigger partes_sincronizar_servicio
  after insert or update of hecho or delete on partes
  for each row execute function public.sincronizar_estado_servicio();

-- ── Vista: estado del parque ─────────────────────────────────────────────────
-- Lo que necesita la pantalla de un box y el panel: cada máquina con su último
-- servicio y si le toca revisión. `security_invoker` es lo que hace que la vista
-- respete la RLS de quien pregunta en vez de la de quien la creó.

create view parque_estado
with (security_invoker = true) as
select
  m.id,
  m.cliente_id,
  m.nombre,
  m.tipo,
  m.marca,
  m.num_serie,
  m.estado,
  m.cadencia_meses,
  m.ultima_revision,
  m.proxima_revision,
  m.activa,
  (
    select count(*) from partes p
    join servicios s on s.id = p.servicio_id
    where p.maquina_id = m.id and p.hecho
  ) as servicios_hechos,
  case
    when m.proxima_revision is null then null
    else m.proxima_revision - (now() at time zone 'Europe/Madrid')::date
  end as dias_hasta_revision
from maquinas m;

comment on view parque_estado is
  'Una fila por máquina con lo que hace falta para pintar el semáforo del parque. '
  'dias_hasta_revision en negativo significa vencida.';
