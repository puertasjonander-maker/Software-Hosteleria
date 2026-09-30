-- ─────────────────────────────────────────────────────────────────────────────
-- Ergobox — fase 5: a quién hay que avisar y de qué (EBX-501)
--
-- El JTBD-4 dice "quiero que el sistema avise, para que la recurrencia no dependa
-- de que yo me acuerde". El "yo" es Ergobox, no el box: el aviso es interno. Es
-- quien tiene que planificar la visita.
--
-- La decisión difícil no es enviar la notificación, es **cuándo NO enviarla**. Una
-- máquina que entra en la ventana de aviso sigue dentro catorce días, y un cron
-- diario ingenuo mandaría catorce avisos de la misma máquina. Eso no es un
-- recordatorio, es acoso, y el resultado conocido es que se silencian los avisos
-- de la aplicación entera.
--
-- La regla, entonces: no se vuelve a avisar de una máquina a la misma persona
-- mientras quede un aviso suyo dentro de la ventana. En la práctica salen dos
-- avisos por ciclo — uno al entrar en la ventana y otro cuando ya está vencida —
-- y ninguno se pierde si el cron falla un día, porque la condición mira el estado
-- y no el cruce exacto de un umbral.
--
-- Estas funciones las llama la función `avisar-revisiones`, que corre en Supabase
-- con la clave de servicio. No se conceden a `authenticated`: nadie que entre por
-- la aplicación tiene motivo para ejecutarlas.
-- ─────────────────────────────────────────────────────────────────────────────

/** La ventana de aviso, en días. Se puede cambiar sin tocar código. */
create or replace function public.dias_aviso_revision()
returns int
language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select (valor #>> '{}')::int from public.ajustes where clave = 'dias_aviso_revision'),
    14
  )
$$;

/**
 * Quién recibe avisos: los internos activos que hayan activado las
 * notificaciones en algún dispositivo.
 *
 * Todos reciben todo. No hay técnicos asignados a boxes concretos — el reparto se
 * decide al planificar la visita, no antes — así que filtrar por algo aquí sería
 * inventarse un modelo que el producto no tiene.
 */
create or replace function public.destinatarios_avisos()
returns table (perfil_id uuid, nombre text, rol rol_usuario)
language sql stable
set search_path = public, pg_temp
as $$
  select distinct p.id, p.nombre, p.rol
    from public.perfiles p
    join public.push_subscriptions s on s.perfil_id = p.id
   where p.activo
     and p.rol in ('admin', 'tecnico')
$$;

/**
 * De qué máquinas hay que avisar a esta persona, hoy.
 *
 * Incluye las vencidas: si algo lleva ochenta días pasado de fecha, callarse
 * porque "ya se avisó en su momento" es justo lo contrario de lo que se pide.
 *
 * `dias` sale negativo cuando está vencida, igual que en `parque_estado`, para
 * que el texto del aviso se escriba con la misma regla que la pantalla.
 */
create or replace function public.avisos_pendientes(p_perfil uuid)
returns table (
  maquina_id uuid,
  maquina text,
  box text,
  proxima_revision date,
  dias int
)
language sql stable
set search_path = public, pg_temp
as $$
  select
    m.id,
    m.nombre,
    c.nombre,
    m.proxima_revision,
    (m.proxima_revision - (now() at time zone 'Europe/Madrid')::date)::int
  from public.maquinas m
  join public.clientes c on c.id = m.cliente_id
  where m.activa
    and c.activo
    and m.proxima_revision is not null
    and m.proxima_revision
        <= (now() at time zone 'Europe/Madrid')::date + public.dias_aviso_revision()
    and not exists (
      select 1
      from public.aviso_log a
      where a.maquina_id = m.id
        and a.perfil_id = p_perfil
        and a.enviado_el
            > (now() at time zone 'Europe/Madrid')::date - public.dias_aviso_revision()
    )
  order by m.proxima_revision, c.nombre, m.nombre
$$;

-- ── Permisos ─────────────────────────────────────────────────────────────────
-- PostgreSQL concede EXECUTE a PUBLIC en cada función nueva, así que hay que
-- quitarlo a mano. Solo las llama el cron, con la clave de servicio.

revoke execute on function
  public.dias_aviso_revision(), public.destinatarios_avisos(), public.avisos_pendientes(uuid)
  from public;

grant execute on function
  public.dias_aviso_revision(), public.destinatarios_avisos(), public.avisos_pendientes(uuid)
  to service_role;

-- ── La suscripción del navegador ─────────────────────────────────────────────
-- `push_subscriptions` ya tenía su política (`push_propio`): cada usuario escribe
-- las suyas y ninguna otra. Con eso, activar los avisos es una escritura normal
-- desde la aplicación y no hace falta ningún endpoint.
--
-- Lo que faltaba era poder borrar la suscripción de un móvil por su endpoint sin
-- saber su id, que es como llega desde el navegador.

create index if not exists push_subscriptions_perfil_idx on push_subscriptions (perfil_id);

comment on table push_subscriptions is
  'Un dispositivo que ha aceptado recibir avisos. El endpoint es único: un mismo '
  'móvil que vuelve a suscribirse actualiza sus claves en vez de acumular filas '
  'muertas.';
