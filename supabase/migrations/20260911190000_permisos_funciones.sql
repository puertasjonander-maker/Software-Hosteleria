-- ─────────────────────────────────────────────────────────────────────────────
-- Ergobox — cerrar las funciones que no son de nadie
--
-- Esto salió al aplicar el esquema contra un Supabase de verdad y pasarle su
-- analizador. Contra un PostgreSQL pelado no se ve, porque el problema no es de
-- PostgreSQL: es de lo que Supabase publica encima.
--
-- PostgreSQL concede EXECUTE a PUBLIC en cada función nueva. Da igual en una base
-- normal, donde para llamar a una función hay que estar conectado. Aquí no: todo
-- lo que viva en el esquema `public` y tenga permiso de PUBLIC aparece como
-- endpoint en `/rest/v1/rpc/<nombre>`, y lo puede llamar cualquiera con la clave
-- anónima, que es pública por diseño.
--
-- Las funciones de trigger no pierden nada por estar ahí —llamadas fuera de un
-- trigger fallan solas— pero no tienen por qué estar. Una superficie que no hace
-- falta se quita, y así el día que una de ellas deje de fallar sola no habrá que
-- acordarse de esto.
--
-- Las cinco funciones de las políticas SÍ tienen que seguir concedidas a
-- `authenticated`: PostgreSQL comprueba el permiso de quien pregunta cuando las
-- evalúa una política, así que sin EXECUTE nadie podría leer nada.
-- ─────────────────────────────────────────────────────────────────────────────

revoke execute on function
  public.touch_updated_at(),
  public.calcular_proxima_revision(),
  public.registrar_alta_maquina(),
  public.aplicar_parte_hecho(),
  public.registrar_cambio_maquina(),
  public.validar_parte(),
  public.validar_evento_manual(),
  public.sincronizar_estado_servicio(),
  public.handle_new_user(),
  public.sincronizar_email_perfil()
  from public, anon, authenticated;

-- Las de las políticas: fuera de PUBLIC, dentro para quien ha entrado.
revoke execute on function
  public.auth_rol(), public.auth_cliente(), public.es_admin(),
  public.es_interno(), public.alcanza_cliente(uuid)
  from public, anon;

grant execute on function
  public.auth_rol(), public.auth_cliente(), public.es_admin(),
  public.es_interno(), public.alcanza_cliente(uuid)
  to authenticated;

-- ── Y el `search_path` de las dos que se habían quedado sin él ───────────────
-- No son SECURITY DEFINER, así que el riesgo es menor, pero una función sin
-- `search_path` fijo resuelve los nombres con el del que la llama. Fijarlo es
-- gratis y quita la duda.

create or replace function public.touch_updated_at()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.calcular_proxima_revision()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.cadencia_meses is null or new.ultima_revision is null then
    new.proxima_revision := null;
  else
    new.proxima_revision := new.ultima_revision + (new.cadencia_meses || ' months')::interval;
  end if;
  return new;
end;
$$;

revoke execute on function
  public.touch_updated_at(), public.calcular_proxima_revision()
  from public, anon, authenticated;

-- `aviso_log` se queda con RLS activa y sin políticas a propósito: solo la toca
-- el cron con la clave de servicio, que se salta la RLS. Sin políticas, nadie
-- más ve ni escribe una fila, que es exactamente lo que se quiere.
comment on table aviso_log is
  'Nunca más de un aviso por máquina, persona y día. RLS activa y sin políticas '
  'a propósito: solo la toca el cron con la clave de servicio.';

-- ── Los dos avisos que quedan y por qué se quedan ────────────────────────────
-- El analizador de Supabase marca `auth_rol()` y `auth_cliente()` como funciones
-- SECURITY DEFINER que puede llamar quien ha entrado. Es verdad, y tiene que
-- seguir siéndolo:
--
--   · SECURITY DEFINER es obligatorio. Las dos leen `perfiles`, y las políticas de
--     `perfiles` las llaman a ellas. En modo invocador la evaluación sería
--     recursiva y no se podría leer ni el propio perfil.
--   · EXECUTE para `authenticated` es obligatorio. PostgreSQL comprueba el permiso
--     de quien pregunta al evaluar una política, así que sin él nadie vería nada.
--
-- Y no filtran nada: las dos empiezan por `where id = auth.uid()`, de modo que lo
-- único que devuelven es el rol y el box de quien llama. Llamarlas por
-- `/rest/v1/rpc/` te dice quién eres tú, que ya lo sabías.
comment on function public.auth_rol() is
  'El rol de QUIEN LLAMA. SECURITY DEFINER por necesidad: las políticas de '
  '`perfiles` la usan, y leer `perfiles` con RLS desde aquí sería recursivo. '
  'No filtra: solo mira la fila de auth.uid().';
comment on function public.auth_cliente() is
  'El box de QUIEN LLAMA, o null si es interno. Mismo motivo que auth_rol() para '
  'ser SECURITY DEFINER, y la misma razón para no filtrar nada.';
