-- ─────────────────────────────────────────────────────────────────────────────
-- Ergobox — prueba de aislamiento, versión para el SQL Editor de Supabase
--
-- Es la misma prueba que `probar-aislamiento.sql` y comprueba lo mismo: con dos
-- boxes dados de alta y un usuario cliente de cada uno, ninguna consulta de uno
-- devuelve una sola fila del otro, y ningún cliente escribe nada en ningún sitio.
--
-- Existe por una razón práctica: la otra versión necesita `psql`, porque usa
-- `\echo`, `\set` y un `begin ... rollback` a mano. En el SQL Editor del panel no
-- hay nada de eso. Aquí todo el recorrido va dentro de un único bloque `do`, que
-- es una sola sentencia y por tanto una sola transacción.
--
-- Cómo se ejecuta: se pega entero en *SQL Editor* y se pulsa *Run*.
--
-- CÓMO SE LEE EL RESULTADO — importante, porque no es lo que parece:
--
--   · Sale en rojo `TODO EN ORDEN — 52 comprobaciones superadas`  → ha ido bien.
--   · Sale en rojo cualquier cosa que empiece por `FALLO ·`       → ha ido mal.
--
-- El "error" final es a propósito. Un bloque `do` es una sola sentencia, así que
-- reventar al terminar deshace la siembra entera: los dos boxes, los cinco
-- usuarios, las máquinas y las fotos de mentira desaparecen solos. Terminar bien
-- y borrar a mano dejaría restos el día que una de las comprobaciones fallara a
-- mitad de camino.
--
-- **Si sale un FALLO, no des acceso a ningún cliente hasta arreglarlo.** En esta
-- arquitectura las políticas no son una capa más: son la única.
-- ─────────────────────────────────────────────────────────────────────────────

create schema if not exists prueba;

create or replace function prueba.afirmar(descripcion text, obtenido bigint, esperado bigint)
returns void language plpgsql as $$
begin
  if obtenido is distinct from esperado then
    raise exception 'FALLO · % — esperaba %, ha devuelto %', descripcion, esperado, obtenido;
  end if;
end;
$$;

/*
 * Ejecuta una escritura y falla si ha escrito algo.
 *
 * Las dos maneras de que una escritura no ocurra cuentan como correcta, y son
 * distintas: un INSERT que no cumple el `with check` revienta con un error, pero
 * un UPDATE cuyo `using` no casa con ninguna fila NO da error — dice que ha tocado
 * cero filas y se queda tan ancho. Mirar solo la excepción dejaría pasar por bueno
 * un `update` que sí hubiera funcionado, así que lo que se cuenta son las filas.
 *
 * La excepción hay que atraparla igualmente: sin atraparla abortaría la
 * transacción y la prueba se pararía en la primera comprobación. Esto pasó de
 * verdad con la comprobación de "no se asciende a sí mismo", que es la única en la
 * que el `using` de la política sí casa (es tu propia fila) y lo que se niega es
 * el `with check`.
 */
create or replace function prueba.debe_rechazar(descripcion text, sentencia text)
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
end;
$$;

grant usage on schema prueba to authenticated;
grant execute on all functions in schema prueba to authenticated;

do $prueba$
declare
  A_BOX constant uuid := '10000000-0000-0000-0000-00000000000a';
  B_BOX constant uuid := '10000000-0000-0000-0000-00000000000b';
  A_USR constant uuid := '00000000-0000-0000-0000-00000000cccc';
  B_USR constant uuid := '00000000-0000-0000-0000-00000000dddd';
  TEC   constant uuid := '00000000-0000-0000-0000-00000000bbbb';
  NADIE constant uuid := '00000000-0000-0000-0000-00000000eeee';
  A_MAQ constant uuid := '20000000-0000-0000-0000-00000000000a';
  B_MAQ constant uuid := '20000000-0000-0000-0000-00000000000b';
  A_SRV constant uuid := '30000000-0000-0000-0000-00000000000a';
  B_SRV constant uuid := '30000000-0000-0000-0000-00000000000b';
  A_PAR constant uuid := '40000000-0000-0000-0000-00000000000a';
  B_PAR constant uuid := '40000000-0000-0000-0000-00000000000b';
begin
  -- ── Dos boxes, cinco personas ─────────────────────────────────────────────
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-00000000aaaa', 'jon@ergobox.es'),
    (TEC,   'tecnico@ergobox.es'),
    (A_USR, 'antonio@ironbuster.es'),
    (B_USR, 'dueno@marbella.es'),
    (NADIE, 'recien.invitado@nadie.es');

  insert into clientes (id, nombre, poblacion) values
    (A_BOX, 'PRUEBA CrossFit IronBuster', 'Pizarra'),
    (B_BOX, 'PRUEBA CrossFit Marbella', 'Marbella');

  update perfiles set rol = 'admin',   nombre = 'Jon'
    where id = '00000000-0000-0000-0000-00000000aaaa';
  update perfiles set rol = 'tecnico', nombre = 'Técnico' where id = TEC;
  update perfiles set nombre = 'Antonio', cliente_id = A_BOX where id = A_USR;
  update perfiles set nombre = 'Dueño Marbella', cliente_id = B_BOX where id = B_USR;
  -- El quinto se queda como nace un usuario recién invitado: cliente y sin box.

  insert into maquinas (id, cliente_id, nombre, tipo, cadencia_meses, ultima_revision) values
    (A_MAQ, A_BOX, 'RowErg 5', 'rowerg', 2, current_date - 90),
    (B_MAQ, B_BOX, 'RowErg 1', 'rowerg', 3, current_date - 10);

  insert into servicios (id, cliente_id, fecha) values
    (A_SRV, A_BOX, current_date - 90),
    (B_SRV, B_BOX, current_date - 10);

  insert into partes (id, servicio_id, maquina_id, trabajo_hecho, estado_despues) values
    (A_PAR, A_SRV, A_MAQ, 'Cadena y raíl', 'verde'),
    (B_PAR, B_SRV, B_MAQ, 'Monitor y batería', 'ambar');

  update partes set hecho = true where id in (A_PAR, B_PAR);

  insert into fotos (parte_id, momento, ruta) values
    (A_PAR, 'antes', A_BOX || '/' || A_SRV || '/a.jpg'),
    (B_PAR, 'antes', B_BOX || '/' || B_SRV || '/b.jpg');

  insert into storage.objects (bucket_id, name) values
    ('fotos', A_BOX || '/' || A_SRV || '/a.jpg'),
    ('fotos', B_BOX || '/' || B_SRV || '/b.jpg');

  -- ── 1. El cliente de IronBuster solo ve IronBuster ────────────────────────
  -- `set local role` más el `sub` del token es exactamente lo que hace PostgREST
  -- al recibir una petición: a partir de aquí, la base de datos cree que quien
  -- pregunta es Antonio.
  perform set_config('request.jwt.claim.sub', A_USR::text, true);
  set local role authenticated;

  perform prueba.afirmar('ve su propio box', (select count(*) from clientes), 1);
  perform prueba.afirmar('no ve el otro box',
    (select count(*) from clientes where id = B_BOX), 0);
  perform prueba.afirmar('ve su máquina', (select count(*) from maquinas), 1);
  perform prueba.afirmar('no ve máquinas ajenas',
    (select count(*) from maquinas where cliente_id = B_BOX), 0);
  perform prueba.afirmar('ve su visita', (select count(*) from servicios), 1);
  perform prueba.afirmar('no ve visitas ajenas',
    (select count(*) from servicios where cliente_id = B_BOX), 0);
  perform prueba.afirmar('ve su parte', (select count(*) from partes), 1);
  perform prueba.afirmar('no ve partes ajenos',
    (select count(*) from partes where id = B_PAR), 0);
  perform prueba.afirmar('ve su foto', (select count(*) from fotos), 1);
  perform prueba.afirmar('no ve fotos ajenas',
    (select count(*) from fotos where parte_id = B_PAR), 0);
  perform prueba.afirmar('ve su histórico (alta + servicio)',
    (select count(*) from eventos_maquina), 2);
  perform prueba.afirmar('no ve el histórico ajeno',
    (select count(*) from eventos_maquina where maquina_id = B_MAQ), 0);
  perform prueba.afirmar('la vista del parque también aísla',
    (select count(*) from parque_estado), 1);
  perform prueba.afirmar('ve su fichero del bucket',
    (select count(*) from storage.objects where bucket_id = 'fotos'), 1);
  perform prueba.afirmar('no ve ficheros ajenos',
    (select count(*) from storage.objects where name like B_BOX || '/%'), 0);
  perform prueba.afirmar('no ve el perfil de nadie más',
    (select count(*) from perfiles), 1);
  perform prueba.afirmar('no ve los ajustes', (select count(*) from ajustes), 0);

  -- ── 2. Y no puede escribir absolutamente nada ─────────────────────────────
  perform prueba.debe_rechazar('no crea máquinas en su box',
    format($f$insert into maquinas (cliente_id, nombre) values (%L, 'Colada')$f$, A_BOX));
  perform prueba.debe_rechazar('no crea máquinas en el box ajeno',
    format($f$insert into maquinas (cliente_id, nombre) values (%L, 'Colada')$f$, B_BOX));
  perform prueba.debe_rechazar('no cambia el semáforo de su máquina',
    format($f$update maquinas set estado = 'verde' where id = %L$f$, A_MAQ));
  perform prueba.debe_rechazar('no borra su máquina',
    format($f$delete from maquinas where id = %L$f$, A_MAQ));
  perform prueba.debe_rechazar('no anota en su histórico',
    format($f$insert into eventos_maquina (maquina_id, tipo, texto) values (%L, 'incidencia', 'Me lo invento')$f$, A_MAQ));
  perform prueba.debe_rechazar('no crea visitas',
    format($f$insert into servicios (cliente_id) values (%L)$f$, A_BOX));
  perform prueba.debe_rechazar('no cierra partes',
    format($f$update partes set hecho = true where id = %L$f$, A_PAR));
  perform prueba.debe_rechazar('no registra fotos',
    format($f$insert into fotos (parte_id, momento, ruta) values (%L, 'antes', 'colada.jpg')$f$, A_PAR));
  perform prueba.debe_rechazar('no da de alta boxes',
    $f$insert into clientes (nombre) values ('PRUEBA Box fantasma')$f$);
  perform prueba.debe_rechazar('no sube ficheros al bucket',
    format($f$insert into storage.objects (bucket_id, name) values ('fotos', %L)$f$, A_BOX || '/colada.jpg'));
  perform prueba.debe_rechazar('no se asciende a sí mismo',
    $f$update perfiles set rol = 'admin' where id = auth.uid()$f$);
  perform prueba.debe_rechazar('no se cambia de box',
    format($f$update perfiles set cliente_id = %L where id = auth.uid()$f$, B_BOX));
  perform prueba.debe_rechazar('no toca el perfil de otro',
    format($f$update perfiles set nombre = 'Yo' where id = %L$f$, B_USR));
  perform prueba.debe_rechazar('no toca los ajustes',
    $f$update ajustes set valor = '999'::jsonb where clave = 'dias_aviso_revision'$f$);

  -- ── 3. La simetría: Marbella tampoco ve IronBuster ────────────────────────
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', B_USR::text, true);
  set local role authenticated;

  perform prueba.afirmar('ve solo su box', (select count(*) from clientes), 1);
  perform prueba.afirmar('no ve máquinas ajenas (Marbella)',
    (select count(*) from maquinas where cliente_id = A_BOX), 0);
  perform prueba.afirmar('no ve fotos ajenas (Marbella)',
    (select count(*) from fotos where parte_id = A_PAR), 0);
  perform prueba.afirmar('no ve el histórico ajeno (Marbella)',
    (select count(*) from eventos_maquina where maquina_id = A_MAQ), 0);
  perform prueba.afirmar('no ve ficheros ajenos (Marbella)',
    (select count(*) from storage.objects where name like A_BOX || '/%'), 0);

  -- ── 4. Un cliente recién invitado, sin box, no ve nada ────────────────────
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', NADIE::text, true);
  set local role authenticated;

  perform prueba.afirmar('ni un box', (select count(*) from clientes), 0);
  perform prueba.afirmar('ni una máquina', (select count(*) from maquinas), 0);
  perform prueba.afirmar('ni una visita', (select count(*) from servicios), 0);
  perform prueba.afirmar('ni un parte', (select count(*) from partes), 0);
  perform prueba.afirmar('ni una foto', (select count(*) from fotos), 0);
  perform prueba.afirmar('ni una línea de histórico',
    (select count(*) from eventos_maquina), 0);
  perform prueba.afirmar('ni una fila de la vista',
    (select count(*) from parque_estado), 0);
  perform prueba.afirmar('ni un fichero del bucket',
    (select count(*) from storage.objects where bucket_id = 'fotos'), 0);

  -- ── 5. Sin sesión no se ve nada de nada ───────────────────────────────────
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role authenticated;

  perform prueba.afirmar('sin token, ni un box', (select count(*) from clientes), 0);
  perform prueba.afirmar('sin token, ni una máquina', (select count(*) from maquinas), 0);
  perform prueba.afirmar('sin token, ni una foto', (select count(*) from fotos), 0);

  -- ── 6. Un interno sí ve los dos boxes, que es el sentido de todo esto ─────
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', TEC::text, true);
  set local role authenticated;

  perform prueba.afirmar('el técnico ve los dos boxes', (select count(*) from clientes), 2);
  perform prueba.afirmar('y las dos máquinas', (select count(*) from maquinas), 2);
  perform prueba.afirmar('y los dos históricos', (select count(*) from eventos_maquina), 4);
  perform prueba.debe_rechazar('pero no da de alta boxes',
    $f$insert into clientes (nombre) values ('PRUEBA Box del técnico')$f$);
  perform prueba.debe_rechazar('ni administra usuarios',
    format($f$update perfiles set rol = 'admin' where id = %L$f$, A_USR));

  perform set_config('role', 'none', true);

  -- Si se llega hasta aquí, las 52 han pasado. Se revienta a propósito: ver la
  -- cabecera del fichero.
  raise exception 'TODO EN ORDEN — 52 comprobaciones superadas, siembra deshecha';
end
$prueba$;
