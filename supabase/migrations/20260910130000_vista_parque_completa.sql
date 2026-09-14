-- ─────────────────────────────────────────────────────────────────────────────
-- Ergobox — `parque_estado` completa
--
-- La vista nació con lo justo para pintar el semáforo de un parque. La ficha de
-- máquina de la fase 1 se edita desde esa misma consulta, y con tres campos
-- fuera (`modelo`, `ubicacion`, `notas`) guardar la ficha los habría borrado:
-- el formulario mandaba null porque nunca los había recibido.
--
-- Se añaden al final a propósito. `create or replace view` solo admite columnas
-- nuevas en la cola; cualquier otro orden obligaría a borrar y recrear la vista,
-- y con ella los permisos.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view parque_estado
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
  end as dias_hasta_revision,
  m.modelo,
  m.ubicacion,
  m.notas
from maquinas m;
