-- ─────────────────────────────────────────────────────────────────────────────
-- Ergobox — prueba de aislamiento entre boxes (obligatoria para cerrar la fase 4)
--
-- Lo que se prueba: con dos boxes dados de alta y un usuario cliente de cada uno,
-- ninguna consulta de uno devuelve una sola fila del otro.
--
-- Se prueba contra la base de datos y no contra la interfaz a propósito. Las
-- pantallas se pueden esquivar: el token de un cliente vale igual contra
-- PostgREST, y ahí no hay `exigirCliente()` que valga. Lo único que separa un box
-- de otro son las políticas de este esquema, así que es a las políticas a las que
-- hay que preguntar.
--
-- Cómo se ejecuta (contra una base con las migraciones aplicadas):
--   psql -v ON_ERROR_STOP=1 -f scripts/probar-aislamiento.sql
--
-- Termina con "TODO EN ORDEN" o revienta en la primera comprobación que falle.
-- No deja nada detrás: todo va dentro de una transacción que se deshace al final.
-- ─────────────────────────────────────────────────────────────────────────────

\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

begin;

-- ── Utilidades de la prueba ──────────────────────────────────────────────────

create schema prueba;

create function prueba.afirmar(descripcion text, obtenido bigint, esperado bigint)
returns void language plpgsql as $$
begin
  if obtenido is distinct from esperado then
    raise exception 'FALLO · % — esperaba %, ha devuelto %', descripcion, esperado, obtenido;
  end if;
  raise notice 'ok · %', descripcion;
end;
$$;

/*
 * Ejecuta una escritura y falla si ha escrito algo.
 *
 * Las dos maneras de que una escritura no ocurra cuentan como correcta, y son
 * distintas: un INSERT que no cumple el `with check` revienta con un error, pero
 * un UPDATE o un DELETE cuyo `using` no casa con ninguna fila NO da error — dice
 * que ha tocado cero filas y se queda tan ancho. Comprobar solo la excepción
 * dejaría pasar por bueno un `update` que sí hubiera funcionado, así que lo que
 * se mira es el número de filas escritas.
 *
 * La excepción hay que atraparla igualmente: sin atraparla abortaría la
 * transacción entera y la prueba se pararía en la primera comprobación.
 */
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

-- ── Dos boxes, cuatro personas ───────────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000aaaa', 'jon@ergobox.es'),
  ('00000000-0000-0000-0000-00000000bbbb', 'tecnico@ergobox.es'),
  ('00000000-0000-0000-0000-00000000cccc', 'antonio@ironbuster.es'),
  ('00000000-0000-0000-0000-00000000dddd', 'dueno@marbella.es'),
  ('00000000-0000-0000-0000-00000000eeee', 'recien.invitado@nadie.es');

insert into clientes (id, nombre, poblacion) values
  ('10000000-0000-0000-0000-00000000000a', 'CrossFit IronBuster', 'Pizarra'),
  ('10000000-0000-0000-0000-00000000000b', 'CrossFit Marbella', 'Marbella');

update perfiles set rol = 'admin',   nombre = 'Jon'     where id = '00000000-0000-0000-0000-00000000aaaa';
update perfiles set rol = 'tecnico', nombre = 'Técnico' where id = '00000000-0000-0000-0000-00000000bbbb';
update perfiles set nombre = 'Antonio', cliente_id = '10000000-0000-0000-0000-00000000000a'
  where id = '00000000-0000-0000-0000-00000000cccc';
update perfiles set nombre = 'Dueño Marbella', cliente_id = '10000000-0000-0000-0000-00000000000b'
  where id = '00000000-0000-0000-0000-00000000dddd';
-- El quinto nace como nace un usuario recién invitado: cliente y sin box.

insert into maquinas (id, cliente_id, nombre, tipo, cadencia_meses, ultima_revision) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a',
   'RowErg 5', 'rowerg', 2, current_date - 90),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b',
   'RowErg 1', 'rowerg', 3, current_date - 10);

insert into servicios (id, cliente_id, fecha) values
  ('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', current_date - 90),
  ('30000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', current_date - 10);

insert into partes (id, servicio_id, maquina_id, trabajo_hecho, estado_despues) values
  ('40000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a',
   '20000000-0000-0000-0000-00000000000a', 'Cadena y raíl', 'verde'),
  ('40000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000b',
   '20000000-0000-0000-0000-00000000000b', 'Monitor y batería', 'ambar');

update partes set hecho = true where id in (
  '40000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000b');

insert into fotos (parte_id, momento, ruta) values
  ('40000000-0000-0000-0000-00000000000a', 'antes',
   '10000000-0000-0000-0000-00000000000a/30000000-0000-0000-0000-00000000000a/a.jpg'),
  ('40000000-0000-0000-0000-00000000000b', 'antes',
   '10000000-0000-0000-0000-00000000000b/30000000-0000-0000-0000-00000000000b/b.jpg');

insert into storage.objects (bucket_id, name) values
  ('fotos', '10000000-0000-0000-0000-00000000000a/30000000-0000-0000-0000-00000000000a/a.jpg'),
  ('fotos', '10000000-0000-0000-0000-00000000000b/30000000-0000-0000-0000-00000000000b/b.jpg');

\set QUIET off
\echo ''
\echo '════ 1. El cliente de IronBuster solo ve IronBuster ════'

set role authenticated;
set "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000cccc';

do $bloque$
begin
  perform prueba.afirmar('ve su propio box', (select count(*) from clientes), 1);
  perform prueba.afirmar('no ve el otro box',
    (select count(*) from clientes where id = '10000000-0000-0000-0000-00000000000b'), 0);
  perform prueba.afirmar('no ve máquinas ajenas',
    (select count(*) from maquinas where cliente_id = '10000000-0000-0000-0000-00000000000b'), 0);
  perform prueba.afirmar('ve su máquina', (select count(*) from maquinas), 1);
  perform prueba.afirmar('no ve servicios ajenos',
    (select count(*) from servicios where cliente_id = '10000000-0000-0000-0000-00000000000b'), 0);
  perform prueba.afirmar('no ve partes ajenos',
    (select count(*) from partes where id = '40000000-0000-0000-0000-00000000000b'), 0);
  perform prueba.afirmar('ve su parte', (select count(*) from partes), 1);
  perform prueba.afirmar('no ve fotos ajenas',
    (select count(*) from fotos where parte_id = '40000000-0000-0000-0000-00000000000b'), 0);
  perform prueba.afirmar('ve su foto', (select count(*) from fotos), 1);
  perform prueba.afirmar('no ve el histórico ajeno',
    (select count(*) from eventos_maquina where maquina_id = '20000000-0000-0000-0000-00000000000b'), 0);
  perform prueba.afirmar('ve su histórico (alta + servicio)', (select count(*) from eventos_maquina), 2);
  perform prueba.afirmar('la vista del parque también aísla', (select count(*) from parque_estado), 1);
  perform prueba.afirmar('no ve ficheros ajenos en el bucket',
    (select count(*) from storage.objects
      where name like '10000000-0000-0000-0000-00000000000b/%'), 0);
  perform prueba.afirmar('ve su fichero',
    (select count(*) from storage.objects where bucket_id = 'fotos'), 1);
  perform prueba.afirmar('no ve el perfil de nadie más', (select count(*) from perfiles), 1);
  perform prueba.afirmar('no ve los ajustes', (select count(*) from ajustes), 0);
end $bloque$;

\echo ''
\echo '════ 2. Y no puede escribir absolutamente nada ════'

do $bloque$
begin
  perform prueba.debe_rechazar('no crea máquinas en su box',
    $$insert into maquinas (cliente_id, nombre) values ('10000000-0000-0000-0000-00000000000a', 'Colada')$$);
  perform prueba.debe_rechazar('no crea máquinas en el box ajeno',
    $$insert into maquinas (cliente_id, nombre) values ('10000000-0000-0000-0000-00000000000b', 'Colada')$$);
  perform prueba.debe_rechazar('no cambia el semáforo de su máquina',
    $$update maquinas set estado = 'verde' where id = '20000000-0000-0000-0000-00000000000a'$$);
  perform prueba.debe_rechazar('no borra su máquina',
    $$delete from maquinas where id = '20000000-0000-0000-0000-00000000000a'$$);
  perform prueba.debe_rechazar('no anota en su histórico',
    $$insert into eventos_maquina (maquina_id, tipo, texto)
      values ('20000000-0000-0000-0000-00000000000a', 'incidencia', 'Me lo invento')$$);
  perform prueba.debe_rechazar('no crea visitas',
    $$insert into servicios (cliente_id) values ('10000000-0000-0000-0000-00000000000a')$$);
  perform prueba.debe_rechazar('no cierra partes',
    $$update partes set hecho = true where id = '40000000-0000-0000-0000-00000000000a'$$);
  perform prueba.debe_rechazar('no registra fotos',
    $$insert into fotos (parte_id, momento, ruta)
      values ('40000000-0000-0000-0000-00000000000a', 'antes', 'colada.jpg')$$);
  perform prueba.debe_rechazar('no da de alta boxes',
    $$insert into clientes (nombre) values ('Box fantasma')$$);
  perform prueba.debe_rechazar('no se asciende a sí mismo',
    $$update perfiles set rol = 'admin' where id = auth.uid()$$);
  perform prueba.debe_rechazar('no se cambia de box',
    $$update perfiles set cliente_id = '10000000-0000-0000-0000-00000000000b' where id = auth.uid()$$);
  perform prueba.debe_rechazar('no toca el perfil de otro',
    $$update perfiles set nombre = 'Yo' where id = '00000000-0000-0000-0000-00000000dddd'$$);
end $bloque$;

\echo ''
\echo '════ 3. La simetría: el cliente de Marbella tampoco ve IronBuster ════'

reset role;
set "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000dddd';
set role authenticated;

do $bloque$
begin
  perform prueba.afirmar('ve solo su box', (select count(*) from clientes), 1);
  perform prueba.afirmar('no ve máquinas ajenas',
    (select count(*) from maquinas where cliente_id = '10000000-0000-0000-0000-00000000000a'), 0);
  perform prueba.afirmar('no ve fotos ajenas',
    (select count(*) from fotos where parte_id = '40000000-0000-0000-0000-00000000000a'), 0);
  perform prueba.afirmar('no ve el histórico ajeno',
    (select count(*) from eventos_maquina where maquina_id = '20000000-0000-0000-0000-00000000000a'), 0);
  perform prueba.afirmar('no ve ficheros ajenos',
    (select count(*) from storage.objects
      where name like '10000000-0000-0000-0000-00000000000a/%'), 0);
end $bloque$;

\echo ''
\echo '════ 4. Un cliente recién invitado, sin box, no ve nada ════'

reset role;
set "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000eeee';
set role authenticated;

do $bloque$
begin
  perform prueba.afirmar('ni un box', (select count(*) from clientes), 0);
  perform prueba.afirmar('ni una máquina', (select count(*) from maquinas), 0);
  perform prueba.afirmar('ni un servicio', (select count(*) from servicios), 0);
  perform prueba.afirmar('ni un parte', (select count(*) from partes), 0);
  perform prueba.afirmar('ni una foto', (select count(*) from fotos), 0);
  perform prueba.afirmar('ni una línea de histórico', (select count(*) from eventos_maquina), 0);
  perform prueba.afirmar('ni una fila de la vista', (select count(*) from parque_estado), 0);
  perform prueba.afirmar('ni un fichero del bucket',
    (select count(*) from storage.objects where bucket_id = 'fotos'), 0);
end $bloque$;

\echo ''
\echo '════ 5. Sin sesión no se ve nada de nada ════'

reset role;
reset "request.jwt.claim.sub";
set role authenticated;

do $bloque$
begin
  perform prueba.afirmar('sin token, ni un box', (select count(*) from clientes), 0);
  perform prueba.afirmar('sin token, ni una máquina', (select count(*) from maquinas), 0);
  perform prueba.afirmar('sin token, ni una foto', (select count(*) from fotos), 0);
end $bloque$;

\echo ''
\echo '════ 6. Un interno sí ve los dos boxes, que es el sentido de todo esto ════'

reset role;
set "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000bbbb';
set role authenticated;

do $bloque$
begin
  perform prueba.afirmar('el técnico ve los dos boxes', (select count(*) from clientes), 2);
  perform prueba.afirmar('y las dos máquinas', (select count(*) from maquinas), 2);
  perform prueba.afirmar('y los dos históricos', (select count(*) from eventos_maquina), 4);
  perform prueba.debe_rechazar('pero no da de alta boxes',
    $$insert into clientes (nombre) values ('Box del técnico')$$);
  perform prueba.debe_rechazar('ni administra usuarios',
    $$update perfiles set rol = 'admin' where id = '00000000-0000-0000-0000-00000000cccc'$$);
end $bloque$;

reset role;

\echo ''
\echo '════ TODO EN ORDEN ════'

rollback;
