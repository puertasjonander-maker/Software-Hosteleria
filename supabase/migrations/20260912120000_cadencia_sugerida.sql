-- ─────────────────────────────────────────────────────────────────────────────
-- Ergobox — la cadencia la decide quien ha tocado la máquina
--
-- Hasta ahora `maquinas.cadencia_meses` se tecleaba en la ficha, casi siempre al
-- dar la máquina de alta y sin haberla abierto todavía. Quien sabe cada cuánto
-- hay que volver es el técnico que acaba de limpiarla, y lo sabe justo en ese
-- momento, con la máquina delante.
--
-- Así que la cadencia pasa a ser una decisión del parte. Queda en el parte además
-- de en la máquina a propósito: la ficha dice cuál es la cadencia hoy, y el
-- histórico dice quién la decidió, cuándo y con qué máquina delante.
-- ─────────────────────────────────────────────────────────────────────────────

alter table partes add column cadencia_sugerida_meses smallint
  check (cadencia_sugerida_meses between 0 and 36);

-- El cero no es un mes de cero: es «esta máquina deja de tener revisión
-- periódica». Hace falta poder decirlo, porque `null` ya significa otra cosa —
-- que el técnico no tocó el asunto— y confundir las dos cosas haría imposible
-- quitarle la cadencia a una máquina desde el campo.
comment on column partes.cadencia_sugerida_meses is
  'Cada cuántos meses vuelve a tocar, decidido al cerrar el parte. 0 = sin '
  'recurrencia. Null = el técnico no lo tocó y la máquina se queda como estaba.';

-- ── El cierre del parte, ahora también con la cadencia ───────────────────────
-- Misma función de siempre, con una línea más en el UPDATE. Se reescribe entera
-- porque `create or replace` no admite parches.

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
           ultima_revision = greatest(coalesce(ultima_revision, v_fecha), v_fecha),
           -- Null en el parte = no se tocó, y entonces la máquina se queda con la
           -- suya. Cero = sin recurrencia, que en la máquina se escribe como null
           -- y es lo que la saca del calendario de revisiones.
           cadencia_meses  = case
             when new.cadencia_sugerida_meses is null then cadencia_meses
             else nullif(new.cadencia_sugerida_meses, 0)
           end
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

revoke execute on function public.aplicar_parte_hecho() from public, anon, authenticated;

-- `proxima_revision` no se toca aquí. La recalcula sola el trigger
-- `maquinas_proxima_revision`, que salta con `cadencia_meses` y con
-- `ultima_revision`, y este UPDATE cambia las dos.
