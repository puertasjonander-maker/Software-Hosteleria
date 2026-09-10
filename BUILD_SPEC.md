# BUILD_SPEC.md — Ergobox · v1

> Documento de construcción para Claude Code. Leer `CONTEXT.md` primero.
> Todo el texto de interfaz va en **español**.

---

## 0. Reglas para el agente constructor

1. **RLS desde el primer commit.** Nada de "ya lo aseguramos luego". Toda tabla
   nueva nace con políticas en la misma migración que la crea.
2. **Ninguna consulta sin política que la autorice.** Si una pantalla necesita
   datos que ninguna política concede, se arregla la política. No se recurre a la
   service role key para esquivar la RLS.
3. **No inventes el parque.** Las máquinas de un box se dan de alta desde la
   pantalla o desde CSV. Si necesitas datos para probar, márcalos como `DEMO` y no
   los mezcles con los de un cliente real.
4. **Sin pantallas en blanco.** Cada vista tiene estado vacío, de carga (skeleton)
   y de error con acción de recuperación.
5. **Offline-tolerante en la visita.** Si se pierde la conexión, el parte y sus
   fotos se guardan en local y se sincronizan al recuperar. Nunca se pierde una
   foto por un fallo de red.
6. **Toda foto se recomprime antes de encolarse.** 1600 px de lado largo, JPEG a
   0.72. El original no se guarda.
7. **El semáforo lo mueve la base de datos.** El estado de una máquina y su
   histórico se escriben por trigger al cerrar un parte, no desde el cliente.
8. **Ship por fase.** Cada fase termina desplegada y probable desde un móvil real.
9. **Objetivo táctil de 44 px** y 16 px de tamaño de fuente en los `input`: por
   debajo, iOS hace zoom al enfocar.

---

## 1. Modelo de datos

SQL-first, en `supabase/migrations/`. `prisma/schema.prisma` es un espejo tipado
y no una fuente de verdad.

| Tabla | Qué es |
|---|---|
| `clientes` | Un box. Es la unidad de aislamiento: toda la RLS cuelga de aquí. |
| `perfiles` | 1:1 con `auth.users`. Rol y, para un cliente, su box. |
| `maquinas` | El parque de un box. Semáforo, cadencia, próxima revisión. |
| `servicios` | Una visita: el trabajo de un día en un box. |
| `partes` | Una máquina dentro de una visita. La unidad de trabajo real. |
| `fotos` | Antes y después, en bucket privado. |
| `eventos_maquina` | El histórico que ve el cliente. |
| `push_subscriptions`, `aviso_log`, `ajustes` | Infraestructura. |

Vista `parque_estado`: una fila por máquina con servicios hechos y días hasta la
revisión. `security_invoker`, para que respete la RLS de quien pregunta.

### Lógica que vive en la base de datos

Está ahí y no en la aplicación porque, si estuviera en la aplicación, se podría
esquivar entrando por otra pantalla.

- `proxima_revision` se deriva de `ultima_revision` + `cadencia_meses`.
- Cerrar un parte (`hecho` de false a true) mueve el semáforo de la máquina, fija
  la fecha de última revisión y escribe la línea del histórico, en una sola
  transacción.
- Un servicio pasa a `hecho` cuando todos sus partes lo están.
- Un parte no puede colgar una máquina de un box del servicio de otro.

### Roles

| Rol | Puede |
|---|---|
| `admin` | Todo, incluidos boxes y usuarios. |
| `tecnico` | Todo el trabajo de campo. No administra usuarios ni da de alta boxes. |
| `cliente` | **Solo lectura**, y solo de su propio box. Ninguna política de escritura lo incluye. |

Un `cliente` sin `cliente_id` asignado no ve nada. Es el estado en el que nace un
usuario recién invitado y falla cerrado a propósito.

---

## 2. Pantallas

| Ruta | Quién | Fase |
|---|---|---|
| `/visitas` | admin, técnico | F2 |
| `/visitas/[id]` | admin, técnico | F2 |
| `/clientes` | admin, técnico | F1 |
| `/clientes/[id]` | admin, técnico | F1 |
| `/clientes/[id]/maquinas/[maquinaId]` | admin, técnico | F3 |
| `/mi-box` | cliente | F4 |
| `/panel` | admin | F3 |
| `/admin` | admin | F4 |

---

## 3. Fase 1 — Boxes y parque · hecha

**EBX-101 · Alta y listado de boxes.** Nombre, dirección, población, contacto.
Listado con el número de máquinas y el peor semáforo del parque.

**EBX-102 · Alta de máquina.** Nombre como lo llama el box ("RowErg 5"), tipo,
marca, modelo, nº de serie, ubicación, cadencia. El damper y el drag factor solo
se piden en Concept2.

**EBX-103 · Importar parque desde CSV.** Validación por fila con informe de lo que
entra y lo que no. Reimportar actualiza por nombre en vez de duplicar. Prueba de
aceptación cubierta por `npm run probar:parque`: las doce de un parque como el de
IronBuster (cinco remos, un ski, un BikeErg, un Maniac y cuatro Eco) en una sola
pasada, con `seed/parque.demo.csv`.

Regla que salió de ahí y que no se toca: **ninguna librería interpreta una fecha
de un CSV.** Solo `nombre` es obligatorio.

**EBX-104 · Ficha de máquina.** Lectura, edición y estado. Sin histórico todavía.

---

## 4. Fase 2 — La visita · construida, pendiente de cronómetro

Es la fase que decide el proyecto. Se diseña contra un cronómetro: **una máquina
completa, con sus fotos, en menos de sesenta segundos de interacción.** Si no se
llega, se recorta la ficha hasta llegar.

**Criterio de cierre, sin cumplir todavía:** una visita real, en un box, con el
móvil de quien la hace. Hasta entonces la fase queda abierta y no se le añade
nada. Lo que hay que mirar allí: cuántos toques cuesta una máquina, si el
protocolo precargado acierta, si las fotos comprimidas sirven de prueba, y si la
cola se vacía sola al salir del local.

**EBX-201 · Planificar una visita.** Elegir box y fecha, y marcar qué máquinas
entran. Por defecto, las que tienen revisión vencida o próxima.

**EBX-202 · Pantalla de trabajo.** Lista de las máquinas de la visita con su
estado de avance. Se entra a una, se sale, se entra a otra. Siempre visible
cuántas quedan.

**EBX-203 · Parte de máquina.** Trabajo previsto precargado por tipo, trabajo
hecho, piezas, estado antes y después, damper y drag factor cuando aplican.

**EBX-204 · Fotos.** Antes y después, varias por momento. Recomprimidas a 1600 px
antes de encolar. Subida a bucket privado.

**EBX-205 · Sin cobertura.** Partes y fotos se guardan en IndexedDB y se
sincronizan al recuperar red, sin duplicar (`client_ref`). Indicador visible de
cuánto queda por subir.

---

## 5. Fase 3 — Histórico y semáforo

**EBX-301 · Línea de tiempo por máquina.** Altas, servicios, cambios de estado e
incidencias, con las fotos de cada servicio.

**EBX-302 · Anotación manual.** Un interno puede añadir un evento que no viene de
un servicio ("llegó con óxido de fábrica", "se la llevaron a una competición").

**EBX-303 · Estado del parque.** El semáforo del box de un vistazo, ordenado por
urgencia. Rojo primero, sin revisar antes que verde.

**EBX-304 · Panel.** Todos los parques, revisiones vencidas y próximas, servicios
por periodo.

---

## 6. Fase 4 — El cliente entra

**EBX-401 · Invitar al dueño de un box.** Crear el usuario y atarlo a su cliente.
Es el único sitio desde el que alguien pasa a ver datos de un box.

**EBX-402 · Vista del cliente.** Su parque, su semáforo, el historial de cada
máquina y las fotos. Solo lectura.

**EBX-403 · Fotos firmadas.** URL caducable generada en servidor tras comprobar la
misma regla de acceso. Nunca una URL pública.

**Prueba de aislamiento, obligatoria antes de dar por hecha la fase:** con dos
boxes dados de alta y un usuario cliente de cada uno, ninguna consulta de uno
devuelve una sola fila del otro. Se prueba contra la base de datos, no contra la
interfaz.

---

## 7. Fase 5 — Avisos

**EBX-501 · Cron de revisiones.** Recorre `maquinas` con `proxima_revision` dentro
de la ventana de aviso y notifica. Un aviso por máquina, persona y día
(`aviso_log`).

**EBX-502 · Reactivar el cron en Vercel.** La entrada se quitó de `vercel.json` en
la fase 0 al borrar la ruta de hostelería. Vuelve aquí, con `CRON_SECRET`.

---

## 8. Lo que este documento no cubre

Presupuestos, facturación, tarifas, CRM e inventario de piezas. Están fuera de la
v1 y siguen en Notion. Si una historia parece necesitarlos, para y pregunta.
