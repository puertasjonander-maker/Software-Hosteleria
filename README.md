# Mise

Sistema de aprovisionamiento para hostelería: el equipo de sala registra lo que
falta desde el móvil, el sistema agrupa las necesidades de los tres locales en un
único pedido por proveedor, se envía por el canal que ya usan (WhatsApp, correo)
y se registra lo que llega y a qué precio.

**No es** un ERP, ni un TPV, ni sustituye a Square. El contexto completo está en
[`CONTEXT.md`](CONTEXT.md) y el backlog en [`BUILD_SPEC.md`](BUILD_SPEC.md).

---

## Qué hay construido

Toda la v1 del `BUILD_SPEC`, en el orden que marca su §6.

| Historia | Qué hace | Dónde |
|---|---|---|
| MISE-000 | Alta de catálogo, proveedores, pautas, locales y usuarios; importación CSV con validación por fila | `/admin` |
| MISE-001 | Registrar faltas desde el móvil, tolerante a la falta de red | `/pedir` |
| MISE-002 | Bandeja por proveedor con corte, desglose por local y autoría | `/pedidos` |
| MISE-003 | Generar el pedido en texto plano y enviarlo por WhatsApp/correo | `/pedidos/[id]` |
| MISE-004 | Aviso push antes de la hora de corte | `/api/cron/recordatorios` |
| MISE-005 | Recepción con incidencias y precio real | `/pedidos/[id]/recepcion` |
| MISE-006 | Aviso de desviación de precio sobre el último conocido | recepción y panel |
| MISE-007 | Gasto por proveedor, local y categoría; evolución de precios; export CSV | `/panel` |
| MISE-008 | Importar el escandallo del Excel y resolver el mapeo de ingredientes | `/escandallo/importar` |
| MISE-009 | Coste y margen por elaboración, evolución y simulador de subidas | `/escandallo` |

### Lo que este repositorio no puede hacer por ti

Dos cosas del `BUILD_SPEC` son de proceso, no de código, y siguen pendientes:

- **La prueba de pasillo (Gate 1).** `/pedir` está construida y desplegable, pero
  el gate exige observar a un barista real usándola en un turno real con el
  catálogo real. Está sin hacer, y es el gate que protege las otras 40 horas.
- **Las preguntas 1-17 de `CONTEXT.md` §8.** Ninguna está confirmada. El código no
  las inventa: el catálogo se carga desde CSV, el importador de escandallo no
  asume estructura y pide que la persona mapee las columnas, y los umbrales son
  configurables en `/admin/ajustes` en vez de estar fijados en el código.

El seed por defecto es **DEMO**: sus proveedores llevan el prefijo `DEMO ·` y el
script se niega a cargarlo sobre una base que ya tenga datos reales.

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
solo se usa en servidor (cron de avisos y alta de usuarios): **nunca** la pongas
con prefijo `NEXT_PUBLIC_`.

### 3. Crear el esquema

Las migraciones son SQL-first y están en `supabase/migrations/`, en orden:

```bash
supabase link --project-ref <tu-project-ref>
supabase db push
```

Sin la CLI, pega los cuatro ficheros en el SQL Editor de Supabase por orden de
nombre. El tercero (`..._rls.sql`) es el que activa Row Level Security: no lo
saltes.

### 4. Cargar datos

```bash
npm run db:seed                                   # catálogo DEMO
npm run db:seed -- --real ruta/al/catalogo.csv    # catálogo real
```

El formato del CSV es el de [`seed/catalogo.demo.csv`](seed/catalogo.demo.csv).
También se puede cargar desde `/admin/importar`, que enseña una previsualización
y los errores fila a fila antes de confirmar.

### 5. Primer usuario

El alta de usuarios vive en `/admin/usuarios`, pero para entrar ahí hace falta ya
un operador. El primero se crea a mano:

1. Supabase → *Authentication → Users → Add user* (con contraseña, confirmando el
   correo).
2. Supabase → *Table editor → profiles* → en la fila recién creada, pon
   `role = operador`.

A partir de ahí, el resto del equipo se da de alta desde la propia app.

### 6. Arrancar

```bash
npm run dev
```

---

## Avisos de corte (MISE-004)

Genera el par de claves VAPID y ponlas en el entorno:

```bash
npx web-push generate-vapid-keys
```

`vercel.json` programa el cron cada media hora. Vercel manda
`Authorization: Bearer $CRON_SECRET`, y la ruta rechaza cualquier petición sin
ese secreto. Los crons por debajo de una vez al día requieren plan Pro; en Hobby,
baja la frecuencia en `vercel.json` o dispara la ruta desde un cron externo.

Sin claves VAPID la app funciona igual: el botón de activar avisos no aparece y el
cron responde que no hay nada que enviar.

---

## Decisiones que conviene conocer antes de tocar el código

**RLS es la seguridad, no las comprobaciones de rol de las páginas.** Las
políticas de `supabase/migrations/..._rls.sql` son lo que impide que un barista
lea las solicitudes de otro local. Los `exigirRol()` de las páginas solo evitan
enseñar una pantalla que saldría vacía. Si añades una consulta, la política es la
que tiene que autorizarla.

**Las migraciones son SQL-first; Prisma es el espejo.** La mitad del
comportamiento (políticas, triggers de coste, vistas con `security_invoker`) no se
puede expresar en el esquema de Prisma. `prisma/schema.prisma` existe para
`prisma studio` y para scripts tipados. **No ejecutes `prisma migrate dev`**:
borraría las políticas.

**Todo coste lleva procedencia.** `real` es un precio de una recepción registrada;
`estimado` viene del Excel o de un precio tecleado a mano. La interfaz nunca
enseña un importe sin esa etiqueta, y una elaboración con ingredientes sin mapear
no tiene coste: tiene un hueco, y se muestra como hueco.

**La cola offline guarda cantidades absolutas, no incrementos.** Reintentar "pon
3" dos veces deja 3; reintentar "+1" dejaría 4. Con red inestable, el reintento
ocurre.

**Un pedido enviado es inmutable.** Se guarda copia literal del texto que salió
(`message_snapshot`) y corregirlo genera un pedido complementario. La pantalla de
un pedido enviado muestra esa copia, no una recomposición a partir del catálogo
actual.

**Las horas de corte son horas de Málaga.** Todo lo que dependa de ellas pasa por
`src/lib/time.ts`, no por `new Date()` a secas: el servidor corre en UTC.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run typecheck` | TypeScript sin emitir |
| `npm run lint` | ESLint |
| `npm run db:seed` | Carga el catálogo (DEMO por defecto) |
| `node scripts/generar-iconos.mjs` | Regenera los iconos PNG de la PWA |

## Estructura

```
src/
  app/
    (app)/          Pantallas con sesión: pedir, pedidos, escandallo, panel, admin
    api/            Cron de avisos, alta de push y exportación CSV
  components/       Kit de UI, gráficos y piezas de PWA
  lib/              Cliente Supabase, cortes, formato, escandallo, catálogo, tiempo
supabase/migrations/  Esquema, lógica de negocio, RLS y RPC — la fuente de verdad
prisma/schema.prisma  Espejo tipado del esquema
seed/                 Catálogo y escandallo DEMO
scripts/              Seed e iconos
```
