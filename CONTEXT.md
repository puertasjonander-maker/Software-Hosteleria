# CONTEXT.md — Ergobox

> Software de mantenimiento para Ergo Box (Málaga): parques de máquinas de
> gimnasio en boxes de crosstraining.
> Este fichero es el contexto de proyecto. Lo leen las role skills (PM, Frontend
> Engineer, Service Designer…) y Claude Code antes de actuar.

---

## 1. Qué es

Ergo Box es una empresa de servicio: va a boxes de crosstraining, abre las
máquinas (remos, ski, bikes, air bikes, barras), las limpia a fondo, las revisa y
deja un informe. Este software es la herramienta de trabajo de ese servicio y, a
la vez, la ventana que el cliente tiene sobre él.

Dos usos en un solo producto:

- **Dentro del box**, con el móvil y las manos sucias: qué máquinas hay, qué toca
  hacer hoy, foto de antes, foto de después, qué se hizo.
- **Desde el despacho del dueño del box**: qué tenéis, en qué estado está, qué le
  habéis hecho y cuándo toca la próxima.

**No es** un ERP de mantenimiento industrial, ni un CRM, ni un sistema de
facturación. Los presupuestos, la facturación y el seguimiento comercial siguen
viviendo en Notion.

## 2. De dónde sale este código

Es un fork de Mise, un sistema de aprovisionamiento para hostelería construido
para otro cliente. Se reutilizó porque la forma es la misma: un sistema
multi-inquilino donde cada cliente ve solo lo suyo, con catálogo por cliente,
partes de trabajo, histórico y trabajo en campo desde el móvil.

Lo que se conservó: autenticación, roles, RLS, PWA, cola offline, sistema visual
y navegación. Lo que se tiró: escandallo, proveedores, pedidos, precios.

La rama principal del repositorio sigue siendo hostelería. Este producto vive en
`claude/ergobox-mantenimiento` y está previsto que salga a su propio repositorio
(`ergobox-app`) cuando la fase 2 esté hecha y usada en una visita real.

## 3. Usuarios

| Tipo | Quién | Qué necesita | Riesgo |
|---|---|---|---|
| **Técnico** | Jon y quien le acompañe | Registrar el trabajo de una máquina sin parar de trabajar, dentro de una nave sin cobertura | Si es más lento que hacer la foto con la cámara y apuntarlo en papel, no lo usa. Este es EL riesgo del proyecto. |
| **Administración** | Jon con el otro sombrero | Ver el estado de todos los parques, saber a quién toca avisar, dar de alta boxes y accesos | Necesita que el dato esté completo sin haber tenido que perseguirlo |
| **Cliente** | Dueño del box (Antonio en IronBuster) | Ver qué tiene, en qué estado y qué le habéis hecho | Si entra una vez y está vacío o desactualizado, no vuelve |

## 4. JTBD centrales

- **JTBD-1** — Cuando estoy delante de una máquina abierta, quiero dejar
  registrado lo que le he hecho y cómo estaba, sin dejar la herramienta, para no
  tener que reconstruirlo por la noche de memoria.
- **JTBD-2** — Cuando preparo una visita, quiero saber exactamente qué máquinas
  hay en ese box y cuáles tocan, para no llegar a ciegas ni cargar de más.
- **JTBD-3** — Cuando el dueño del box me pregunta qué le hemos hecho, quiero que
  lo pueda ver él mismo, para que el trabajo se note sin tener que contarlo.
- **JTBD-4** — Cuando a un cliente le toca la siguiente revisión, quiero que el
  sistema avise, para que la recurrencia no dependa de que yo me acuerde.

## 5. Alcance

### DENTRO de la v1

- Alta de boxes y de su parque de máquinas, con importación desde CSV.
- Ficha de máquina: tipo, marca, nº de serie, ubicación, semáforo, cadencia.
- Visitas: planificar, ejecutar y cerrar el trabajo de un día en un box.
- Parte por máquina con fotos de antes y después, funcionando sin cobertura.
- Histórico por máquina, visible para el cliente.
- Vista del cliente, de solo lectura, sobre su propio box.
- Aviso de próxima revisión.

### FUERA de la v1

- Presupuestos y propuestas en PDF. Siguen en Notion.
- Facturación e IVA.
- Leads, campañas y seguimiento comercial. Siguen en Notion.
- Tarifas, packs y cálculo de desplazamiento.
- Inventario de piezas y stock de consumibles.

La columna `partes.importe` existe desde el primer día aunque los presupuestos
estén fuera de alcance. Es el único gancho que se deja puesto a propósito: cuando
entren, no habrá que migrar nada.

## 6. Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui sobre primitivas de Radix
- Supabase: Postgres, Auth, Storage y RLS
- Prisma **solo como espejo tipado**. Las migraciones son SQL-first y viven en
  `supabase/migrations/`
- PWA instalable con cola de mutaciones en IndexedDB
- Vercel

## 7. Fases

Cada una deja algo utilizable. El orden no es negociable.

| Fase | Qué deja | Estado |
|---|---|---|
| **F0** | Esquema, RLS, almacenamiento de fotos, andamio de rutas | hecha |
| **F1** | Boxes y parque, con importación CSV | pendiente |
| **F2** | Visita en campo: ficha, fotos, offline | pendiente |
| **F3** | Histórico y semáforo del parque | pendiente |
| **F4** | Vista del cliente y gestión de accesos | pendiente |
| **F5** | Avisos de próxima revisión | pendiente |

La fase 2 es la que decide si el sistema se usa o se abandona. Conviene llegar a
ella pronto y no adornarla antes de haberla probado en un box de verdad.

## 8. Supuestos a confirmar en campo

1. **Que sesenta segundos por máquina son alcanzables.** Es el presupuesto de
   interacción de la fase 2. Si no se llega, se recorta la ficha, no el plazo.
2. **Que las fotos comprimidas a 1600 px sirven como prueba.** Documentan óxido,
   suciedad y desgaste. Si un caso real necesita más resolución, se sube el tope
   antes de que haya cientos de fotos guardadas.
3. **Que el dueño del box entra más de una vez.** Si la vista del cliente se usa
   solo el día que se le enseña, el valor está en el trabajo interno y la fase 4
   se reduce a un informe enviado.
4. **Que hay un protocolo por tipo de máquina.** El parte de la visita del 8 de
   septiembre dice que sin él se pierde tiempo. Precargarlo en la ficha es la
   mitad del valor del sistema.

## 9. Principios de diseño no negociables

1. **Registrar una máquina tiene que costar menos que apuntarla en papel.** Si
   una pantalla añade un paso, se quita.
2. **Mobile-first literal.** Se usa de pie, agachado, con guantes, con las manos
   sucias y sin cobertura.
3. **La foto es el dato.** Todo lo demás es texto que se puede recuperar; una
   foto que no se hizo no se recupera. Nunca se pierde una por un fallo de red.
4. **Nadie escribe texto libre si puede pulsar.** El parque está precargado y el
   protocolo también.
5. **El sistema nunca bloquea el trabajo.** Si falla, se trabaja igual y se
   registra después.
6. **El cliente ve lo mismo que nosotros, no una versión maquillada.** Si una
   máquina está en rojo, la ve en rojo.

## 10. Seguridad

La RLS es la frontera. Las comprobaciones de rol en las páginas (`exigirRol`,
`exigirCliente`) son cosmética: evitan enseñar una pantalla que saldría vacía.

- Toda consulta nueva tiene que estar autorizada por una política. Si una pantalla
  necesita datos que ninguna política concede, el arreglo es la política, no el
  cliente de servicio.
- `SUPABASE_SERVICE_ROLE_KEY` solo se usa en servidor. **Nunca** con prefijo
  `NEXT_PUBLIC_`.
- Las fotos viven en un bucket privado. El cliente recibe URLs firmadas y
  caducables, nunca públicas.
- **No ejecutes `prisma migrate dev`**: borraría las políticas.
