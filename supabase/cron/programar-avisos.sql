-- ─────────────────────────────────────────────────────────────────────────────
-- Ergobox — programar el aviso diario (EBX-502)
--
-- Esto NO es una migración y no se ejecuta sola: lleva dentro la dirección del
-- proyecto y una clave, y ninguna de las dos puede vivir en el repositorio. Se
-- pega una vez en el SQL Editor de Supabase, con los valores propios.
--
-- La alternativa sin SQL, y probablemente la que conviene: en el panel de
-- Supabase, *Integrations → Cron → Create job*, eligiendo "Supabase Edge
-- Function" y `avisar-revisiones`. Hace exactamente esto y la clave la pone
-- Supabase. Si se usa esa vía, hay que añadir a mano la cabecera `x-cron-secret`.
--
-- La hora: 06:00 UTC. En Madrid son las 08:00 en verano y las 07:00 en invierno.
-- El desfase de una hora da igual para un recordatorio de mantenimiento, y
-- perseguirlo obligaría a ejecutar el cron cada hora para descartar 23 de ellas.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Las extensiones. En Supabase se activan también desde *Database → Extensions*.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Los secretos, en Vault, para que no queden en el texto del job.
--    Cambia los tres valores antes de ejecutar.
--
--    · url_avisos    → https://<tu-ref>.supabase.co/functions/v1/avisar-revisiones
--    · clave_avisos  → la clave `anon` del proyecto (la función comprueba el
--                      secreto de abajo, no esta clave; va solo para pasar el
--                      portero de las Edge Functions)
--    · secreto_cron  → una cadena larga inventada, la misma que pondrás en
--                      `supabase secrets set CRON_SECRET=...`

select vault.create_secret('https://TU-REF.supabase.co/functions/v1/avisar-revisiones', 'url_avisos');
select vault.create_secret('TU-CLAVE-ANON', 'clave_avisos');
select vault.create_secret('TU-SECRETO-LARGO-INVENTADO', 'secreto_cron');

-- 3. El job.
select cron.schedule(
  'ergobox-avisos-revision',
  '0 6 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'url_avisos'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'clave_avisos'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'secreto_cron')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- ── Comprobar que funciona ───────────────────────────────────────────────────

-- Qué está programado:
--   select jobid, jobname, schedule, active from cron.job;
--
-- Cómo fue la última vez (la respuesta de la función sale en `net._http_response`):
--   select runid, status, return_message, start_time
--     from cron.job_run_details
--    where jobname = 'ergobox-avisos-revision'
--    order by start_time desc limit 5;
--
-- Dispararlo ahora sin esperar a mañana: copia el `select net.http_post(...)` de
-- arriba y ejecútalo suelto.
--
-- Quitarlo:
--   select cron.unschedule('ergobox-avisos-revision');
