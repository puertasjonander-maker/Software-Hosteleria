-- ─────────────────────────────────────────────────────────────────────────────
-- Ergobox — el correo, en el perfil
--
-- La pantalla de administración necesita enseñar con qué correo entra cada uno.
-- El correo vive en `auth.users`, que PostgREST no expone, así que hasta ahora se
-- leía con la clave de servicio: una pantalla entera dependía de la única clave
-- que se salta toda la seguridad, para enseñar un dato que no es secreto.
--
-- Se copia al perfil y se acabó el problema. Lo mantiene el mismo trigger que ya
-- creaba el perfil, más uno de actualización por si alguien cambia de correo
-- desde el panel de Supabase.
--
-- Quién lo ve: exactamente quien ya veía la fila. Un interno ve todos los
-- perfiles; un cliente, solo el suyo. La política no cambia porque no hace falta.
-- ─────────────────────────────────────────────────────────────────────────────

alter table perfiles add column email text;

comment on column perfiles.email is
  'Copia del correo de auth.users, mantenida por trigger. Está aquí para no tener '
  'que usar la clave de servicio solo para leerlo.';

-- ── Alta: el perfil nace con su correo ───────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, rol, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    'cliente',
    new.email
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- ── Cambio de correo: se refleja ─────────────────────────────────────────────

create or replace function public.sincronizar_email_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.perfiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_actualizado
  after update of email on auth.users
  for each row execute function public.sincronizar_email_perfil();

-- ── Los que ya existían ──────────────────────────────────────────────────────

update public.perfiles p
   set email = u.email
  from auth.users u
 where u.id = p.id and p.email is distinct from u.email;
