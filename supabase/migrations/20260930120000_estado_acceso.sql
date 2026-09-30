-- ─────────────────────────────────────────────────────────────────────────────
-- Ergobox — accesos: quién ha entrado y quién tiene que cambiar la contraseña
--
-- Dos necesidades que salieron de usar la pantalla de administración de verdad:
--
-- 1. Nadie sabe si un cliente ha llegado a entrar. Se le manda el acceso y de ahí
--    en adelante es un misterio hasta que llama. El dato existe
--    (`auth.users.last_sign_in_at`), pero PostgREST no expone `auth`, así que se
--    publica con una función de solo lectura que solo contesta a un administrador.
--
-- 2. La contraseña temporal viaja por correo o por WhatsApp, o sea, queda escrita
--    en sitios que no controlamos. No puede seguir valiendo: se marca al crear o
--    restablecer, y la aplicación obliga a elegir una propia en el primer acceso.
--    Es una barandilla de interfaz, no una frontera de seguridad: la frontera
--    sigue siendo la RLS.
-- ─────────────────────────────────────────────────────────────────────────────

alter table perfiles
  add column debe_cambiar_contrasena boolean not null default false;

comment on column perfiles.debe_cambiar_contrasena is
  'Verdadero mientras la contraseña sea la temporal que generó la función '
  '`alta-usuario`. La aplicación no deja pasar de la pantalla de cambio hasta '
  'que el propio usuario la apaga.';

create or replace function public.estado_accesos()
returns table (perfil_id uuid, ultimo_acceso timestamptz, invitado_el timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id, u.last_sign_in_at, u.created_at
    from auth.users u
   where public.es_admin()
$$;

comment on function public.estado_accesos() is
  'Último acceso y fecha de alta de cada usuario. SECURITY DEFINER porque lee '
  '`auth.users`; el filtro `es_admin()` hace que un no administrador reciba cero '
  'filas en lugar de un error que delate que la función existe.';

revoke execute on function public.estado_accesos() from public, anon;
grant execute on function public.estado_accesos() to authenticated;

-- ── Un usuario desactivado no puede reactivarse solo ─────────────────────────
--
-- Salió al repasar los accesos. `perfiles_update_propio` impedía auto-ascenderse
-- y auto-asignarse un box, pero no decía nada de `activo`: quien tenía el acceso
-- cortado podía, con su propia sesión, hacer `update perfiles set activo = true`
-- sobre su fila y volver a entrar. «Desactivar» era, en la práctica, una
-- sugerencia. Ahora `activo` tampoco se toca por cuenta propia.

drop policy perfiles_update_propio on perfiles;

create policy perfiles_update_propio on perfiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and rol = (select p.rol from public.perfiles p where p.id = auth.uid())
    and cliente_id is not distinct from
        (select p.cliente_id from public.perfiles p where p.id = auth.uid())
    and activo = (select p.activo from public.perfiles p where p.id = auth.uid())
  );
