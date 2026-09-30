-- ─────────────────────────────────────────────────────────────────────────────
-- Ergobox v1 — almacenamiento de fotos
--
-- Las fotos de antes y después son la mitad del valor del producto: son la prueba
-- de que el trabajo se hizo. También son el dato más sensible que hay aquí, porque
-- enseñan el interior del local de un cliente.
--
-- Por eso el bucket es privado. No hay URL pública en ninguna parte: la aplicación
-- firma un enlace caducable en servidor, después de comprobar la misma regla de
-- acceso que protege la tabla `fotos`.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fotos',
  'fotos',
  false,
  -- 3 MB. Una foto de móvil sin tocar pesa cuatro o cinco; el cliente la
  -- redimensiona a 1600 px de lado largo antes de subirla y baja a unos 200 kB.
  -- Este tope es la red de seguridad que hace ruidoso saltarse ese paso, no el
  -- tamaño que esperamos.
  3145728,
  array['image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- ── Lectura ──────────────────────────────────────────────────────────────────
-- Se comprueba contra la tabla `fotos` en vez de trocear la ruta y convertirla a
-- uuid. Es exacto y no puede reventar con un nombre de fichero inesperado: si la
-- foto no está registrada, no se lee.

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
    )
  );

-- ── Escritura ────────────────────────────────────────────────────────────────
-- Solo sube fotos quien hace el trabajo. El cliente no sube nada: su rol no entra
-- en ninguna de estas tres políticas.

create policy "fotos subir" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos' and public.es_interno());

create policy "fotos actualizar" on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos' and public.es_interno())
  with check (bucket_id = 'fotos' and public.es_interno());

create policy "fotos borrar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos' and public.es_interno());
