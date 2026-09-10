-- ─────────────────────────────────────────────────────────────────────────────
-- Ergobox — el histórico de una máquina (fase 3)
--
-- Lo que se prueba aquí no se puede probar desde la interfaz: que cerrar un parte
-- deje UNA línea y no dos. El semáforo de una máquina lo mueven dos triggers
-- distintos —el del parte y el de la ficha— y los dos escriben en el histórico.
-- Sin la marca de transacción que uno le pasa al otro, cada visita dejaría el
-- trabajo y, pegado, un "cambio de estado" fantasma que el cliente leería como si
-- hubiéramos ido dos veces.
--
-- Uso (ver scripts/supabase-stub.sql para montar la base):
--   psql -v ON_ERROR_STOP=1 -f scripts/probar-historico.sql
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

create function prueba.debe_rechazar(descripcion text, sentencia text)
returns void language plpgsql as $$
declare filas bigint := 0;
begin
  begin
    execute sentencia;
    get diagnostics filas = row_count;
  exception when others then
    filas := 0;
  end;
  if filas > 0 then
    raise exception 'FALLO · % — ha escrito % fila(s) y no debía', descripcion, filas;
  end if;
  raise notice 'ok · %', descripcion;
end;
$$;

grant usage on schema prueba to authenticated;
grant execute on all functions in schema prueba to authenticated;

-- ── Un box, un técnico, dos máquinas ─────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000bbbb', 'tecnico@ergobox.es');

insert into clientes (id, nombre) values
  ('10000000-0000-0000-0000-00000000000a', 'CrossFit IronBuster');

update perfiles set rol = 'tecnico', nombre = 'Técnico'
  where id = '00000000-0000-0000-0000-00000000bbbb';

set "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000bbbb';
set role authenticated;

insert into maquinas (id, cliente_id, nombre, tipo, cadencia_meses, ultima_revision) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a',
   'RowErg 5', 'rowerg', 2, '2026-01-10'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000a',
   'SkiErg 1', 'skierg', null, null);

\set QUIET off
\echo ''
\echo '════ 1. El alta escribe su línea y la próxima revisión se deriva sola ════'

do $bloque$
begin
  perform prueba.afirmar('el alta deja una línea por máquina',
    (select count(*) from eventos_maquina where tipo = 'alta'), 2);
  perform prueba.afirmar('próxima revisión = última + cadencia',
    (select proxima_revision::text from maquinas where id = '20000000-0000-0000-0000-00000000000a'),
    '2026-03-10');
  perform prueba.afirmar('sin cadencia no hay próxima revisión',
    (select coalesce(proxima_revision::text, 'null') from maquinas
      where id = '20000000-0000-0000-0000-00000000000b'),
    'null');
end $bloque$;

\echo ''
\echo '════ 2. Cerrar un parte deja UNA línea, no dos ════'

insert into servicios (id, cliente_id, fecha) values
  ('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '2026-04-20');

insert into partes (id, servicio_id, maquina_id, trabajo_hecho, estado_despues) values
  ('40000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a',
   '20000000-0000-0000-0000-00000000000a', 'Cadena, raíl y monitor', 'verde');

update partes set hecho = true where id = '40000000-0000-0000-0000-00000000000a';

do $bloque$
begin
  perform prueba.afirmar('una sola línea de servicio',
    (select count(*) from eventos_maquina
      where maquina_id = '20000000-0000-0000-0000-00000000000a' and tipo = 'servicio'), 1);
  -- La comprobación que da sentido a la marca de transacción: el update que hace
  -- el trigger del parte sobre `maquinas.estado` no puede dejar su propia línea.
  perform prueba.afirmar('y ningún cambio de estado fantasma',
    (select count(*) from eventos_maquina
      where maquina_id = '20000000-0000-0000-0000-00000000000a' and tipo = 'cambio_estado'), 0);
  perform prueba.afirmar('el texto es el trabajo hecho',
    (select texto from eventos_maquina where tipo = 'servicio'), 'Cadena, raíl y monitor');
  perform prueba.afirmar('el semáforo de la máquina se ha movido',
    (select estado::text from maquinas where id = '20000000-0000-0000-0000-00000000000a'), 'verde');
  perform prueba.afirmar('y la última revisión es la de la visita',
    (select ultima_revision::text from maquinas where id = '20000000-0000-0000-0000-00000000000a'),
    '2026-04-20');
  perform prueba.afirmar('con su próxima recalculada',
    (select proxima_revision::text from maquinas where id = '20000000-0000-0000-0000-00000000000a'),
    '2026-06-20');
  perform prueba.afirmar('el servicio queda cerrado',
    (select estado::text from servicios where id = '30000000-0000-0000-0000-00000000000a'), 'hecho');
end $bloque$;

\echo ''
\echo '════ 3. Reeditar un parte ya cerrado no reescribe la historia ════'

update partes set trabajo_hecho = 'Cadena, raíl, monitor y batería'
  where id = '40000000-0000-0000-0000-00000000000a';
update partes set hecho = true where id = '40000000-0000-0000-0000-00000000000a';

do $bloque$
begin
  perform prueba.afirmar('sigue habiendo una sola línea de servicio',
    (select count(*) from eventos_maquina where tipo = 'servicio'), 1);
  perform prueba.afirmar('con el texto del cierre, no el de después',
    (select texto from eventos_maquina where tipo = 'servicio'), 'Cadena, raíl y monitor');
end $bloque$;

\echo ''
\echo '════ 4. Los cambios de la ficha que sí son historia ════'

-- Guardar la ficha sin tocar el semáforo: el formulario manda `estado` siempre.
update maquinas set estado = 'verde', marca = 'Concept2', num_serie = '250123'
  where id = '20000000-0000-0000-0000-00000000000a';

do $bloque$
begin
  perform prueba.afirmar('corregir la marca no es historia',
    (select count(*) from eventos_maquina
      where maquina_id = '20000000-0000-0000-0000-00000000000a' and tipo = 'cambio_estado'), 0);
end $bloque$;

update maquinas set estado = 'rojo' where id = '20000000-0000-0000-0000-00000000000a';

do $bloque$
begin
  perform prueba.afirmar('mover el semáforo a mano sí lo es',
    (select count(*) from eventos_maquina
      where maquina_id = '20000000-0000-0000-0000-00000000000a' and tipo = 'cambio_estado'), 1);
  perform prueba.afirmar('y deja escrito en qué queda',
    (select estado_resultante::text from eventos_maquina where tipo = 'cambio_estado'), 'rojo');
end $bloque$;

update maquinas set activa = false where id = '20000000-0000-0000-0000-00000000000b';

do $bloque$
begin
  perform prueba.afirmar('sacar una máquina del parque escribe su baja',
    (select count(*) from eventos_maquina
      where maquina_id = '20000000-0000-0000-0000-00000000000b' and tipo = 'baja'), 1);
end $bloque$;

update maquinas set activa = true where id = '20000000-0000-0000-0000-00000000000b';

do $bloque$
begin
  perform prueba.afirmar('devolverla escribe su vuelta',
    (select count(*) from eventos_maquina
      where maquina_id = '20000000-0000-0000-0000-00000000000b'
        and tipo = 'alta' and texto = 'Vuelve al parque'), 1);
  perform prueba.afirmar('la baja no se pierde',
    (select count(*) from eventos_maquina
      where maquina_id = '20000000-0000-0000-0000-00000000000b' and tipo = 'baja'), 1);
end $bloque$;

\echo ''
\echo '════ 5. La anotación a mano (EBX-302) ════'

insert into eventos_maquina (maquina_id, fecha, tipo, texto) values
  ('20000000-0000-0000-0000-00000000000a', '2026-02-01', 'incidencia',
   'Llegó con óxido de fábrica en el raíl');

do $bloque$
begin
  perform prueba.afirmar('una incidencia a mano entra',
    (select count(*) from eventos_maquina where tipo = 'incidencia'), 1);
  perform prueba.afirmar('con la fecha que se le puso, no la de hoy',
    (select fecha::text from eventos_maquina where tipo = 'incidencia'), '2026-02-01');
  perform prueba.afirmar('anotar no mueve el semáforo de la máquina',
    (select estado::text from maquinas where id = '20000000-0000-0000-0000-00000000000a'), 'rojo');

  perform prueba.debe_rechazar('no se inventa un servicio sin parte',
    $sql$insert into eventos_maquina (maquina_id, tipo, texto)
      values ('20000000-0000-0000-0000-00000000000a', 'servicio', 'Visita que no existió')$sql$);

  perform prueba.debe_rechazar('no se cuelga un parte de otra máquina',
    $sql$insert into eventos_maquina (maquina_id, tipo, texto, parte_id)
      values ('20000000-0000-0000-0000-00000000000b', 'servicio', 'Robado',
              '40000000-0000-0000-0000-00000000000a')$sql$);

  perform prueba.debe_rechazar('ni se anota en una máquina que no existe',
    $sql$insert into eventos_maquina (maquina_id, tipo, texto)
      values ('20000000-0000-0000-0000-0000000000ff', 'incidencia', 'Fantasma')$sql$);
end $bloque$;

\echo ''
\echo '════ 6. El histórico completo de la máquina, en orden ════'

do $bloque$
declare linea record;
begin
  for linea in
    select fecha, tipo, texto from eventos_maquina
     where maquina_id = '20000000-0000-0000-0000-00000000000a'
     order by fecha desc, created_at desc
  loop
    raise notice '   % · % · %', linea.fecha, rpad(linea.tipo::text, 14), linea.texto;
  end loop;

  perform prueba.afirmar('cuatro líneas: alta, incidencia, servicio y cambio de estado',
    (select count(*) from eventos_maquina
      where maquina_id = '20000000-0000-0000-0000-00000000000a'), 4);
end $bloque$;

reset role;

\echo ''
\echo '════ TODO EN ORDEN ════'

rollback;
