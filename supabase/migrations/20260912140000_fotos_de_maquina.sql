-- ─────────────────────────────────────────────────────────────────────────────
-- Ergobox — fotos del antes al inventariar
--
-- Hasta ahora una foto colgaba de un parte. Al inventariar un box por primera vez
-- no hay parte todavía, así que el estado inicial de una máquina se quedaba sin
-- prueba gráfica. Es justo cuando más falta hace: esa es la foto que demuestra
-- cómo llegó la máquina, y es la que se mira cuando tres meses después alguien
-- pregunta si ese óxido ya estaba.
--
-- Así que una foto cuelga de un parte O de una máquina. De uno de los dos, nunca
-- de los dos a la vez ni de ninguno.
-- ─────────────────────────────────────────────────────────────────────────────

alter table fotos alter column parte_id drop not null;

alter table fotos add column maquina_id uuid references maquinas (id) on delete cascade;

-- `num_nonnulls` y no un OR escrito a mano: dice exactamente lo que queremos
-- —uno y solo uno— y no hay manera de leerlo al revés.
alter table fotos add constraint fotos_destino
  check (num_nonnulls(parte_id, maquina_id) = 1);

comment on column fotos.maquina_id is
  'La máquina a la que pertenece la foto cuando no hay parte: el inventario '
  'inicial. Va con parte_id a null, y nunca los dos a la vez.';

comment on column fotos.ruta is
  'Ruta dentro del bucket privado `fotos`. Con parte: <cliente_id>/<servicio_id>/'
  '<parte_id>/<uuid>.jpg. De inventario: <cliente_id>/maquinas/<maquina_id>/'
  '<uuid>.jpg. El cliente nunca recibe una URL pública: se le firma una caducable '
  'después de comprobar la misma regla de acceso.';

create index fotos_maquina_idx on fotos (maquina_id, orden) where maquina_id is not null;

-- ── Quién ve qué ─────────────────────────────────────────────────────────────
-- La regla no cambia: se ve la foto de un box si se alcanza ese box. Lo que
-- cambia es que ahora hay dos caminos para llegar al box desde una foto.

drop policy fotos_select on fotos;

create policy fotos_select on fotos
  for select to authenticated
  using (
    exists (
      select 1 from partes p
      join servicios s on s.id = p.servicio_id
      where p.id = fotos.parte_id and public.alcanza_cliente(s.cliente_id)
    )
    or exists (
      select 1 from maquinas m
      where m.id = fotos.maquina_id and public.alcanza_cliente(m.cliente_id)
    )
  );

-- `fotos_write` no se toca: sigue siendo «solo un interno escribe», y eso vale
-- igual para los dos caminos. El cliente no sube fotos ni de un parte ni de una
-- máquina.

-- ── Y lo mismo en el bucket ──────────────────────────────────────────────────
-- Se comprueba contra la tabla `fotos` y no troceando la ruta, por lo mismo de
-- siempre: es exacto y no puede reventar con un nombre de fichero inesperado.

drop policy "fotos leer" on storage.objects;

create policy "fotos leer" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fotos'
    and (
      public.es_interno()
      or exists (
        select 1
        from public.fotos f
        join public.partes p    on p.id = f.parte_id
        join public.servicios s on s.id = p.servicio_id
        where f.ruta = storage.objects.name
          and public.alcanza_cliente(s.cliente_id)
      )
      or exists (
        select 1
        from public.fotos f
        join public.maquinas m on m.id = f.maquina_id
        where f.ruta = storage.objects.name
          and public.alcanza_cliente(m.cliente_id)
      )
    )
  );
