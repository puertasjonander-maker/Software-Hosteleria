# Ergobox

Software de mantenimiento para [Ergo Box](https://ergobox.es): parques de máquinas
de gimnasio en boxes de crosstraining. El técnico registra el trabajo desde el
móvil dentro del box, con fotos de antes y después y sin depender de que haya
cobertura; el dueño del box entra con su propio usuario y ve su parque, su estado
y su historial.

**No es** un ERP de mantenimiento, ni un CRM, ni un sistema de facturación. Los
presupuestos y el seguimiento comercial siguen en Notion. El contexto completo
está en [`CONTEXT.md`](CONTEXT.md), el backlog en [`BUILD_SPEC.md`](BUILD_SPEC.md)
y cómo ponerlo en producción bajo `app.ergobox.es` en [`DESPLIEGUE.md`](DESPLIEGUE.md).

---

## Estado: fases 0 a 4

Este repositorio es un fork de Mise, un sistema de aprovisionamiento para
hostelería que compartía forma con este problema: multi-inquilino con aislamiento
por cliente, trabajo en campo desde el móvil, partes e histórico.

La fase 0 ha vaciado el dominio de hostelería y ha dejado puesto el de Ergobox.

| | |
|---|---|
| **Hecho** | Esquema, RLS, lógica en base de datos, bucket privado de fotos, roles, navegación, boxes y parque con importación CSV, la visita en campo con fotos y cola sin cobertura, el histórico por máquina, el panel, la vista del cliente y la gestión de accesos |
| **Conservado de Mise** | Autenticación, PWA, cola offline, sistema visual, kit de UI, navegación |
| **Retirado** | Escandallo, proveedores, pedidos, recepción, histórico de precios y su seed |
| **Pendiente** | Fase 5: avisos de próxima revisión (cron y push) |

Las seis pantallas están construidas: `/visitas`, `/clientes`, la ficha de máquina
con su historial, `/panel`, `/mi-box` y `/admin`.

**La fase 2 no está cerrada.** El código está, pero la pantalla de trabajo es la
que decide si el sistema se usa o se abandona, y eso solo lo dice un cronómetro
dentro de un box: una máquina completa, con sus fotos, en menos de sesenta
segundos. Hasta esa prueba, no se le añade nada.

---

## Puesta en marcha

### 1. Requisitos

- Node 20 o superior
- Un proyecto de [Supabase](https://supabase.com)

### 2. Instalar y configurar

```bash
npm install
cp .env.example .env.local     # y rellena los valores
```

Las claves de Supabase están en *Project Settings → API*. `SUPABASE_SERVICE_ROLE_KEY`
solo se usa en servidor: **nunca** la pongas con prefijo `NEXT_PUBLIC_`.

### 3. Crear el esquema

Las migraciones son SQL-first y están en `supabase/migrations/`, en orden:

```bash
supabase link --project-ref <tu-project-ref>
supabase db push
```

Sin la CLI, pega los ficheros en el SQL Editor de Supabase por orden de nombre.
El de `..._rls.sql` es el que activa Row Level Security y el de
`..._almacenamiento.sql` crea el bucket privado de fotos con sus políticas: no te
saltes ninguno de los dos.

### 4. Primer usuario

El resto de altas se hacen desde `/admin`, pero el primer administrador no puede
crearse desde una pantalla que exige ser administrador. Se hace a mano una vez:

1. Supabase → *Authentication → Users → Add user*, con contraseña y confirmando
   el correo.
2. Supabase → *Table editor → perfiles* → en la fila recién creada, pon
   `rol = admin`.

Un usuario recién creado nace con `rol = cliente` y sin box asignado, que es el
estado que no ve absolutamente nada. Es deliberado: los permisos se dan, no se
heredan del registro.

### 5. Arrancar

```bash
npm run dev
```

---

## Decisiones que conviene conocer antes de tocar el código

**RLS es la seguridad, no las comprobaciones de rol de las páginas.** Las
políticas de `supabase/migrations/..._rls.sql` son lo único que impide que el
dueño de un box vea el parque de otro. Los `exigirRol()` y `exigirCliente()` de
las páginas solo evitan enseñar una pantalla que saldría vacía. Si añades una
consulta, la política es la que tiene que autorizarla.

**El semáforo lo mueve la base de datos.** Cerrar un parte actualiza el estado de
la máquina, fija la fecha de última revisión y escribe la línea del histórico, en
una sola transacción y por trigger. Si eso viviera en el cliente, bastaría con
perder la cobertura a medias para dejar la ficha mintiendo.

**Las fotos son la mitad del producto y el dato más sensible que hay aquí.** El
bucket es privado, no hay ninguna URL pública, y el cliente recibe enlaces
firmados y caducables generados en servidor tras comprobar la misma regla de
acceso que protege la tabla.

**Toda foto se recomprime antes de subirse.** 1600 px de lado largo. Una visita de
doce máquinas con fotos de antes y después son unas setenta imágenes: sin
comprimir son casi 300 MB en el navegador, que es cuando el sistema operativo
decide borrarte la pestaña. Comprimidas, quince megas.

**Las migraciones son SQL-first; Prisma es el espejo.** La mitad del
comportamiento (políticas, triggers, vistas con `security_invoker`, políticas de
storage) no se puede expresar en el esquema de Prisma. **No ejecutes
`prisma migrate dev`**: borraría las políticas.

**La escritura de campo va siempre a la cola local, haya cobertura o no.** Un
único camino: guardar en IndexedDB y disparar la sincronización. Con dos caminos,
el de sin cobertura sería el que nunca se prueba, y es el que importa. Las fotos
suben antes que el cierre del parte a propósito: cerrar un parte escribe el
histórico que ve el cliente, y si llegara antes que sus fotos, un corte de red
dejaría un servicio cerrado sin la prueba de que se hizo.

**Ninguna librería interpreta una fecha de un CSV.** Un CSV se parte con
papaparse, que devuelve texto y nada más. El lector de Excel adivina qué celdas
son fechas y las adivina en orden americano: con él, el `08/09/2026` de una hoja
rellenada aquí se convertía en el 9 de agosto sin avisar. En un `.xlsx` de verdad
no hay nada que adivinar, porque Excel guarda las fechas como número de serie, y
ahí sí se deja que las resuelva. `npm run probar:parque` cubre los dos caminos.

**El aislamiento entre boxes se prueba contra la base de datos, no contra la
interfaz.** `scripts/probar-aislamiento.sql` levanta dos boxes con un cliente cada
uno y comprueba, tabla por tabla, que ninguno ve ni una fila del otro ni puede
escribir en ninguna parte. Las pantallas se pueden esquivar: el token de un
cliente vale igual contra PostgREST. Si tocas una política, vuelve a pasarlo.

**Las fechas son fechas de Málaga.** Todo lo que dependa de ellas pasa por
`src/lib/time.ts`, no por `new Date()` a secas: el servidor corre en UTC.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run typecheck` | TypeScript sin emitir |
| `npm run lint` | ESLint |
| `npm run probar:parque` | Prueba el intérprete del CSV del parque |
| `npm run probar:sql` | Prueba el histórico y el aislamiento entre boxes contra Postgres |
| `node scripts/generar-iconos.mjs` | Regenera los iconos PNG de la PWA |

## Estructura

```
src/
  app/
    (app)/          Pantallas con sesión: visitas, clientes, mi-box, panel, admin
    api/            Alta de suscripciones push
  components/       Kit de UI y piezas de PWA
  lib/              Cliente Supabase, sesión, roles, cola offline, formato, tiempo
supabase/migrations/  Esquema, lógica, RLS y almacenamiento — la fuente de verdad
prisma/schema.prisma  Espejo tipado del esquema
seed/                 Parque de demo para probar la importación
scripts/              Iconos, prueba del CSV y las dos pruebas SQL
```

Para las pruebas SQL hace falta un PostgreSQL cualquiera, no un Supabase:

```bash
createdb ergobox
psql -d ergobox -f scripts/supabase-stub.sql
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d ergobox -f "$f"; done
PGDATABASE=ergobox npm run probar:sql
```

El stub reproduce lo justo de Supabase de lo que dependen las migraciones: los
tres roles, `auth.users` con su trigger, `auth.uid()` leyendo un GUC, y la tabla
de objetos del bucket. Las dos pruebas se hacen y se deshacen dentro de una
transacción, así que no dejan nada.
