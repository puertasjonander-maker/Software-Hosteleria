-- ─────────────────────────────────────────────────────────────────────────────
-- Ergobox — a quién se avisa y de qué (fase 5)
--
-- Lo que se prueba aquí es la regla de silencio, que es la parte del aviso que no
-- se ve y la que decide si el sistema se usa o se silencia: una máquina no vuelve
-- a avisarse a la misma persona mientras quede un aviso suyo dentro de la ventana.
--
-- Sin esto, un cron diario manda catorce avisos de la misma máquina y a la
-- segunda semana nadie mira las notificaciones de la aplicación.
--
-- Uso (ver scripts/supabase-stub.sql para montar la base):
--   psql -v ON_ERROR_STOP=1 -f scripts/probar-avisos.sql
-- ─────────────────────────────────────────────────────────────────────────────

\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

begin;

create schema prueba;

create function prueba.afirmar(descripcion text, obtenido text, esperado text)
returns void language plpgsql as $$
begin
  if obtenido is distinct from esperado then
    raise exception 'FALLO · % — esperaba "%", ha devuelto "%"', descripcion, esperado, obtenido;
  end if;
  raise notice 'ok · %', descripcion;
end;
$$;

create function prueba.afirmar(descripcion text, obtenido bigint, esperado bigint)
returns void language plpgsql as $$
begin
  perform prueba.afirmar(descripcion, obtenido::text, esperado::text);
end;
$$;

-- ── Un box, dos internos y un cliente ────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000aaaa', 'jon@ergobox.es'),
  ('00000000-0000-0000-0000-00000000bbbb', 'tecnico@ergobox.es'),
  ('00000000-0000-0000-0000-00000000cccc', 'antonio@ironbuster.es');

insert into clientes (id, nombre) values
  ('10000000-0000-0000-0000-00000000000a', 'CrossFit IronBuster'),
  ('10000000-0000-0000-0000-00000000000b', 'Box cerrado');

update perfiles set rol = 'admin',   nombre = 'Jon'     where id = '00000000-0000-0000-0000-00000000aaaa';
update perfiles set rol = 'tecnico', nombre = 'Técnico' where id = '00000000-0000-0000-0000-00000000bbbb';
update perfiles set nombre = 'Antonio', cliente_id = '10000000-0000-0000-0000-00000000000a'
  where id = '00000000-0000-0000-0000-00000000cccc';

-- El parque, colocado alrededor de la ventana de 14 días que trae `ajustes`.
insert into maquinas (id, cliente_id, nombre, cadencia_meses, ultima_revision) values
  -- Vencida hace 80 días.
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   'RowErg vencida', 1, (now() at time zone 'Europe/Madrid')::date - 110),
  -- Le toca dentro de 5 días: dentro de la ventana.
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a',
   'SkiErg en 5 días', 1, (now() at time zone 'Europe/Madrid')::date - 25),
  -- Le toca dentro de 40 días: fuera de la ventana.
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000a',
   'BikeErg lejana', 3, (now() at time zone 'Europe/Madrid')::date - 50),
  -- Sin cadencia contratada: no entra en los avisos, esté como esté.
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-00000000000a',
   'Barra sin cadencia', null, null);

-- Una máquina vencida en un box dado de baja: no se avisa de lo que ya no se
-- mantiene.
insert into maquinas (id, cliente_id, nombre, cadencia_meses, ultima_revision) values
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-00000000000b',
   'RowErg del box cerrado', 1, (now() at time zone 'Europe/Madrid')::date - 200);
update clientes set activo = false where id = '10000000-0000-0000-0000-00000000000b';

\set QUIET off
\echo ''
\echo '════ 1. Qué entra en la ventana ════'

do $bloque$
declare v_lista text;
begin
  perform prueba.afirmar('la ventana por defecto son 14 días',
    public.dias_aviso_revision(), 14);

  select string_agg(maquina, ', ' order by proxima_revision)
    into v_lista
    from public.avisos_pendientes('00000000-0000-0000-0000-00000000aaaa');

  perform prueba.afirmar('avisa de la vencida y de la próxima, en ese orden',
    v_lista, 'RowErg vencida, SkiErg en 5 días');

  perform prueba.afirmar('y de nada más',
    (select count(*) from public.avisos_pendientes('00000000-0000-0000-0000-00000000aaaa')), 2);

  perform prueba.afirmar('los días salen en negativo si está vencida',
    (select dias < 0 from public.avisos_pendientes('00000000-0000-0000-0000-00000000aaaa')
      where maquina = 'RowErg vencida')::text, 'true');
end $bloque$;

\echo ''
\echo '════ 2. Quién los recibe ════'

insert into push_subscriptions (perfil_id, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-00000000aaaa', 'https://push.example/jon-movil', 'k', 'a'),
  ('00000000-0000-0000-0000-00000000aaaa', 'https://push.example/jon-tablet', 'k', 'a'),
  ('00000000-0000-0000-0000-00000000cccc', 'https://push.example/antonio', 'k', 'a');

do $bloque$
begin
  perform prueba.afirmar('solo quien ha activado los avisos',
    (select count(*) from public.destinatarios_avisos()), 1);

  perform prueba.afirmar('y una sola vez aunque tenga dos dispositivos',
    (select count(*) from public.destinatarios_avisos()
      where perfil_id = '00000000-0000-0000-0000-00000000aaaa'), 1);

  -- El aviso de revisión es para quien planifica la visita. El dueño del box ve
  -- su semáforo cuando entra; no se le persigue con notificaciones.
  perform prueba.afirmar('el cliente no recibe avisos aunque se haya suscrito',
    (select count(*) from public.destinatarios_avisos()
      where perfil_id = '00000000-0000-0000-0000-00000000cccc'), 0);
end $bloque$;

insert into push_subscriptions (perfil_id, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-00000000bbbb', 'https://push.example/tecnico', 'k', 'a');

do $bloque$
begin
  perform prueba.afirmar('el técnico también, en cuanto los activa',
    (select count(*) from public.destinatarios_avisos()), 2);
end $bloque$;

\echo ''
\echo '════ 3. La regla de silencio ════'

-- Se avisa hoy de las dos máquinas a Jon.
insert into aviso_log (maquina_id, perfil_id, enviado_el) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaaa',
   (now() at time zone 'Europe/Madrid')::date),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000aaaa',
   (now() at time zone 'Europe/Madrid')::date);

do $bloque$
begin
  perform prueba.afirmar('mañana no se le repite ninguna',
    (select count(*) from public.avisos_pendientes('00000000-0000-0000-0000-00000000aaaa')), 0);

  perform prueba.afirmar('pero al técnico sí, que a él no se le ha avisado',
    (select count(*) from public.avisos_pendientes('00000000-0000-0000-0000-00000000bbbb')), 2);
end $bloque$;

-- Catorce días después, el aviso de Jon ya ha salido de la ventana.
update aviso_log set enviado_el = (now() at time zone 'Europe/Madrid')::date - 15
  where perfil_id = '00000000-0000-0000-0000-00000000aaaa';

do $bloque$
begin
  perform prueba.afirmar('pasada la ventana se vuelve a avisar',
    (select count(*) from public.avisos_pendientes('00000000-0000-0000-0000-00000000aaaa')), 2);
end $bloque$;

-- Los dos lados del borde. El silencio dura exactamente la ventana: un aviso de
-- hace trece días todavía calla, y el del día catorce ya vuelve a sonar.
update aviso_log set enviado_el = (now() at time zone 'Europe/Madrid')::date - 13
  where perfil_id = '00000000-0000-0000-0000-00000000aaaa';

do $bloque$
begin
  perform prueba.afirmar('el día trece todavía calla',
    (select count(*) from public.avisos_pendientes('00000000-0000-0000-0000-00000000aaaa')), 0);
end $bloque$;

update aviso_log set enviado_el = (now() at time zone 'Europe/Madrid')::date - 14
  where perfil_id = '00000000-0000-0000-0000-00000000aaaa';

do $bloque$
begin
  perform prueba.afirmar('el día catorce vuelve a avisar',
    (select count(*) from public.avisos_pendientes('00000000-0000-0000-0000-00000000aaaa')), 2);
end $bloque$;

\echo ''
\echo '════ 4. Un servicio hecho apaga el aviso ════'

-- Lo que de verdad tiene que callar un aviso no es el tiempo: es haber ido. Se
-- cierra un parte de la máquina vencida y su próxima revisión se va al futuro.
insert into servicios (id, cliente_id, fecha) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   (now() at time zone 'Europe/Madrid')::date);
insert into partes (id, servicio_id, maquina_id, trabajo_hecho, estado_despues) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'Cadena y raíl', 'verde');
update partes set hecho = true where id = '40000000-0000-0000-0000-000000000001';

do $bloque$
begin
  perform prueba.afirmar('la máquina revisada sale de la lista del técnico',
    (select count(*) from public.avisos_pendientes('00000000-0000-0000-0000-00000000bbbb')
      where maquina = 'RowErg vencida'), 0);
  perform prueba.afirmar('y la otra sigue',
    (select count(*) from public.avisos_pendientes('00000000-0000-0000-0000-00000000bbbb')), 1);
end $bloque$;

\echo ''
\echo '════ 5. La ventana se puede cambiar sin tocar código ════'

update ajustes set valor = '60'::jsonb where clave = 'dias_aviso_revision';

do $bloque$
begin
  perform prueba.afirmar('la ventana nueva se lee de ajustes',
    public.dias_aviso_revision(), 60);

  -- Con 60 días entran las tres: la lejana, la que toca en cinco, y la que se
  -- acaba de revisar, cuya próxima cae dentro de un mes y por tanto también
  -- dentro de la ventana nueva.
  perform prueba.afirmar('y con 60 días entra todo lo que cae dentro',
    (select string_agg(maquina, ', ' order by proxima_revision)
       from public.avisos_pendientes('00000000-0000-0000-0000-00000000bbbb')),
    'SkiErg en 5 días, RowErg vencida, BikeErg lejana');
end $bloque$;

\echo ''
\echo '════ 6. Nadie más puede ejecutar esto ════'

do $bloque$
declare pudo boolean := false;
begin
  begin
    set local role authenticated;
    perform public.avisos_pendientes('00000000-0000-0000-0000-00000000aaaa');
    pudo := true;
  exception when insufficient_privilege then
    null;
  end;

  reset role;
  if pudo then
    raise exception 'FALLO · un usuario corriente ha podido ejecutar avisos_pendientes';
  end if;
  raise notice 'ok · un usuario corriente no puede ejecutar avisos_pendientes';
end $bloque$;

\echo ''
\echo '════ TODO EN ORDEN ════'

rollback;
