-- ─────────────────────────────────────────────────────────────────────────────
-- Ergobox — fase 3: el histórico completo
--
-- La fase 1 ya escribía el alta de una máquina y la fase 2 el servicio. Faltaban
-- las dos cosas que pasan fuera de una visita y que el cliente pregunta igual:
-- por qué su remo pasó a rojo un martes sin que fuera nadie, y dónde está la
-- máquina que ya no aparece en la lista.
--
-- El problema de escribirlo con un trigger sobre `maquinas` es que el cierre de
-- un parte TAMBIÉN actualiza `maquinas.estado`. Sin protección, cada servicio
-- dejaría dos líneas en el histórico: la del trabajo y una de "cambio de estado"
-- fantasma. Se resuelve con una marca de transacción que el trigger del parte
-- levanta mientras hace su update, y que el de la máquina mira antes de escribir.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── El orden dentro de un mismo día ──────────────────────────────────────────
-- `now()` es la hora de la transacción, así que dos eventos escritos en la misma
-- transacción —el alta de una máquina y una anotación inmediata, por ejemplo—
-- salían con el mismo `created_at` al milisegundo y la línea de tiempo los
-- ordenaba al azar. `clock_timestamp()` es la hora real de cada insert.

alter table eventos_maquina alter column created_at set default clock_timestamp();

-- ── El alta siempre dice algo ────────────────────────────────────────────────
-- El texto se componía de marca, modelo y número de serie, y una máquina
-- inventariada de pie en la primera visita no tiene ninguno de los tres: la
-- primera línea del historial salía vacía.

create or replace function public.registrar_alta_maquina()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_texto text;
begin
  v_texto := trim(coalesce(new.marca, '') || ' ' || coalesce(new.modelo, '')) ||
    case when new.num_serie is not null then ' · nº ' || new.num_serie else '' end;

  insert into public.eventos_maquina (maquina_id, tipo, texto, estado_resultante, autor_id)
  values (
    new.id,
    'alta',
    coalesce(nullif(trim(v_texto), ''), 'Añadida al parque'),
    new.estado,
    auth.uid()
  );
  return new;
end;
$$;

-- ── El cierre del parte avisa de que el cambio de estado es suyo ──────────────
-- Idéntica a la de la fase 2 salvo las dos líneas de `set_config`. La marca es
-- local a la transacción (tercer argumento `true`), así que no se filtra a la
-- siguiente petición aunque la conexión se reutilice, y se baja en cuanto el
-- update termina para no tapar un cambio a mano hecho después en la misma
-- transacción.

create or replace function public.aplicar_parte_hecho()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_fecha date;
begin
  if new.hecho and not coalesce(old.hecho, false) then
    select fecha into v_fecha from public.servicios where id = new.servicio_id;

    perform set_config('ergobox.origen', 'parte', true);

    update public.maquinas
       set estado          = coalesce(new.estado_despues, estado),
           ultima_revision = greatest(coalesce(ultima_revision, v_fecha), v_fecha)
     where id = new.maquina_id;

    perform set_config('ergobox.origen', '', true);

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

-- ── Cambios de la ficha que merecen una línea (EBX-301) ──────────────────────
-- Solo dos: el semáforo movido a mano y la entrada o salida del parque. Renombrar
-- una máquina o corregirle el número de serie no es historia, es una errata.
--
-- `after update of estado, activa` se dispara cuando esas columnas aparecen en el
-- SET, tenga o no valor nuevo — el formulario de la ficha las manda siempre — así
-- que la comparación con OLD es la que decide de verdad.

create or replace function public.registrar_cambio_maquina()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('ergobox.origen', true), '') = 'parte' then
    return new;
  end if;

  if new.activa is distinct from old.activa then
    insert into public.eventos_maquina
      (maquina_id, tipo, texto, estado_resultante, autor_id)
    values (
      new.id,
      case when new.activa then 'alta' else 'baja' end::tipo_evento,
      case when new.activa then 'Vuelve al parque' else 'Sale del parque' end,
      new.estado,
      auth.uid()
    );
    return new;
  end if;

  if new.estado is distinct from old.estado then
    insert into public.eventos_maquina
      (maquina_id, tipo, texto, estado_resultante, autor_id)
    values (new.id, 'cambio_estado', 'Estado cambiado desde la ficha', new.estado, auth.uid());
  end if;

  return new;
end;
$$;

create trigger maquinas_registrar_cambio
  after update of estado, activa on maquinas
  for each row execute function public.registrar_cambio_maquina();

-- ── Anotación a mano (EBX-302) ───────────────────────────────────────────────
-- La política de escritura de `eventos_maquina` ya deja escribir a un interno,
-- pero deja escribir cualquier cosa: un evento de tipo `servicio` colgado de un
-- parte que no existe, o una línea en la ficha de una máquina de otro box con
-- solo cambiar el id en la petición.
--
-- Esta comprobación cierra las dos. Va en la base de datos, y no en la acción de
-- servidor, porque la acción se puede esquivar llamando a PostgREST directamente
-- con el token de un técnico.

create or replace function public.validar_evento_manual()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Un trigger nuestro escribe con la marca puesta o con parte_id; una anotación
  -- a mano no tiene ninguna de las dos y es la única que pasa por aquí.
  if new.parte_id is not null then
    if not exists (
      select 1 from public.partes p where p.id = new.parte_id and p.maquina_id = new.maquina_id
    ) then
      raise exception 'El parte % no es de esta máquina', new.parte_id
        using errcode = 'check_violation';
    end if;
  elsif new.tipo = 'servicio' then
    raise exception 'Un evento de servicio tiene que venir de un parte'
      using errcode = 'check_violation';
  end if;

  -- Sin usuario en el token no hay a quién comprobar: es la semilla o el cron,
  -- que corren con la service role y ya se saltan la RLS por definición.
  if auth.uid() is not null and not exists (
    select 1 from public.maquinas m
    where m.id = new.maquina_id and public.alcanza_cliente(m.cliente_id)
  ) then
    raise exception 'Esa máquina no es de un box que puedas tocar'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger eventos_validar
  before insert on eventos_maquina
  for each row execute function public.validar_evento_manual();

comment on function public.validar_evento_manual() is
  'Impide colgar una línea del histórico de una máquina ajena o inventar un '
  'evento de servicio sin parte. Se comprueba aquí porque la acción de servidor '
  'se puede esquivar llamando a PostgREST con el token de un técnico.';
