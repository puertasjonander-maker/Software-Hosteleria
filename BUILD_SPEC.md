# BUILD_SPEC.md — Mise · v1 completa

> Documento de construcción para Claude Code. Leer `CONTEXT.md` primero.
> Todo el texto de interfaz va en **español**.

---

## 0. Reglas para el agente constructor

1. **No inventes el catálogo.** Productos, proveedores y precios se cargan desde
   un seed real (`/seed/catalogo.csv`). Si no existe, genera un seed de ejemplo
   claramente marcado como `DEMO` y no lo mezcles con datos reales.
2. **RLS desde el primer commit.** Nada de "ya lo aseguramos luego".
3. **No implementes Square ni inventario teórico.** Están fuera de alcance. El
   escandallo entra en v1 (MISE-008/009) únicamente como importación y cálculo
   de coste — nunca como motor de consumo. Si una historia parece necesitar
   ventas de Square o conteos de stock, para y pregunta.
7. **Todo coste lleva procedencia.** `estimado` (precio del Excel) o `real`
   (precio de una recepción). Nunca se muestra un estimado sin etiquetar, nunca
   se calcula el coste de una elaboración con líneas sin mapear.
8. **La app tiene que ser útil antes de que el escandallo esté mapeado.** Pedir,
   agrupar, enviar y recibir funcionan al 100% con cero elaboraciones importadas.
   El módulo de coste es aditivo, jamás un requisito de arranque.
4. **Sin pantallas en blanco.** Cada vista tiene estado vacío, de carga
   (skeleton) y de error con acción de recuperación.
5. **Ship por historia.** Cada historia termina desplegada en Vercel y probable
   desde un móvil real.
6. **Offline-tolerante en `/pedir`.** Si se pierde la conexión, la solicitud se
   guarda en local y se sincroniza al recuperar.

---

## 1. Modelo de datos (Postgres / Supabase)

```
profiles
  id uuid PK → auth.users
  full_name text
  role enum('barista','encargado','operador')
  location_id uuid FK → locations (null para operador)

locations
  id uuid PK
  name text            -- "Local Centro", "Local Teatinos"…
  active bool default true

suppliers
  id uuid PK
  name text
  contact_channel enum('whatsapp','email','telefono')
  contact_value text   -- número o correo
  notes text
  active bool default true

supplier_schedules       -- pauta de pedido
  id uuid PK
  supplier_id uuid FK
  order_weekday int      -- 0=domingo … 6=sábado
  cutoff_time time       -- hora límite para solicitar
  delivery_weekday int
  lead_time_days int

products
  id uuid PK
  supplier_id uuid FK
  name text
  category text          -- café, lácteos, panadería, fruta, seco, limpieza…
  order_unit text        -- "caja 6 ud", "saco 1 kg", "bandeja"
  base_unit enum('kg','l','ud')
  units_per_order_unit numeric
  last_known_price numeric   -- informativo, no vinculante
  active bool default true

location_products        -- qué maneja cada local
  location_id uuid FK
  product_id uuid FK
  par_level numeric null -- nivel objetivo, opcional
  active bool default true
  PK(location_id, product_id)

requests                 -- solicitud de reposición del barista
  id uuid PK
  location_id uuid FK
  product_id uuid FK
  qty numeric            -- en order_unit
  note text null
  requested_by uuid FK → profiles
  status enum('pendiente','en_pedido','cancelada')
  order_id uuid FK null → orders
  created_at timestamptz

orders
  id uuid PK
  supplier_id uuid FK
  status enum('borrador','enviado','recibido_parcial','cerrado')
  order_date date
  expected_delivery date
  channel enum('whatsapp','email','telefono')
  sent_by uuid FK null
  sent_at timestamptz null
  message_snapshot text  -- copia exacta del texto enviado
  created_at timestamptz

order_lines
  id uuid PK
  order_id uuid FK
  product_id uuid FK
  qty_total numeric
  qty_by_location jsonb  -- {"<location_id>": 3, …}
  unit_price_expected numeric null

receipts
  id uuid PK
  order_id uuid FK
  location_id uuid FK
  received_by uuid FK
  received_at timestamptz
  doc_ref text null      -- nº de albarán

receipt_lines
  id uuid PK
  receipt_id uuid FK
  product_id uuid FK
  qty_received numeric
  unit_price_actual numeric null
  incidence enum('ninguna','falta','danado','precio_distinto','sustituido')
  note text null

price_history
  id uuid PK
  product_id uuid FK
  price numeric
  source enum('recepcion','manual')
  effective_date date
```

### Políticas RLS

- `barista`: lee `products`/`suppliers` activos; lee y crea `requests` **solo de
  su `location_id`**; lee `orders` de proveedores que sirven a su local.
- `encargado`: todo lo anterior en los tres locales + crear/editar/enviar
  `orders` + crear `receipts`.
- `operador`: lectura total + administración de catálogo y usuarios.

---

## 2. Pantallas

| Ruta | Usuario | Propósito |
|---|---|---|
| `/pedir` | Barista | Registrar faltas. **Pantalla crítica del producto.** |
| `/pedidos` | Encargado | Bandeja por proveedor, con corte y estado |
| `/pedidos/[id]` | Encargado | Revisar agregado, ajustar, generar y enviar |
| `/pedidos/[id]/recepcion` | Encargado/Barista | Confirmar lo recibido |
| `/panel` | Operador | Gasto, evolución de precios, incidencias |
| `/admin` | Operador | Productos, proveedores, pautas, usuarios |

---

## 3. Backlog — Bloque A "Pedir"

```
STORY ID: MISE-001
JTBD: JTBD-1
STAGE: Registro de falta

AS A: Barista
I WANT TO: marcar qué producto falta y en qué cantidad desde el móvil
SO THAT: quede registrado sin tener que acordarme al final del turno

ACCEPTANCE CRITERIA (Functional):
  - [ ] La lista muestra solo productos activos de MI local, agrupada por categoría
  - [ ] Buscador que filtra por nombre a partir de 2 caracteres
  - [ ] Stepper +/- por producto; el valor por defecto al primer toque es 1
  - [ ] Al pulsar +, la solicitud se persiste sin botón de "guardar" adicional
  - [ ] Si no hay red, la solicitud se guarda en local y se sincroniza al volver
  - [ ] Un producto ya solicitado hoy aparece marcado con la cantidad acumulada

ACCEPTANCE CRITERIA (Experience):
  - [ ] El usuario siente: "esto es más rápido que mandar un WhatsApp"
  - [ ] Registrar 5 productos toma < 30 segundos medidos con cronómetro
  - [ ] Señal de confianza: confirmación visual inmediata, sin esperar al servidor
  - [ ] Fallo cubierto: sin conexión → aviso discreto "se enviará al recuperar red",
        nunca un error bloqueante
  - [ ] Necesidad de información: se ve cuándo es el próximo corte de ese proveedor

ACCEPTANCE CRITERIA (Visual):
  - [ ] Objetivos táctiles ≥ 44px; usable con una sola mano
  - [ ] Estados: vacío ("aún no has pedido nada hoy"), carga (skeleton de lista),
        error, sin conexión
  - [ ] Mobile-first: 360px es el diseño base; escritorio es adaptación

PRIORITY: Must
EFFORT: L (7-10h)
DEPENDENCIES: catálogo cargado (MISE-000)
```

```
STORY ID: MISE-000
JTBD: habilitador
AS A: Operador
I WANT TO: cargar proveedores, productos, pautas de pedido y locales
SO THAT: el resto del sistema tenga sobre qué operar

ACCEPTANCE CRITERIA (Functional):
  - [ ] Importación desde CSV con validación y previsualización antes de confirmar
  - [ ] CRUD de proveedores, productos y pautas
  - [ ] Asignación de productos a locales (alta/baja masiva)
  - [ ] Alta de usuarios con rol y local
ACCEPTANCE CRITERIA (Experience):
  - [ ] El operador puede cargar el catálogo completo en < 30 min
  - [ ] Errores de importación se muestran por fila, no como fallo global
ACCEPTANCE CRITERIA (Visual):
  - [ ] Tablas con shadcn/ui, densidad alta, escritorio primero (uso admin)
PRIORITY: Must
EFFORT: M (4-6h)
```

```
STORY ID: MISE-002
JTBD: JTBD-2
STAGE: Consolidación

AS A: Encargado
I WANT TO: ver todas las solicitudes pendientes agrupadas por proveedor
SO THAT: pueda mandar un único pedido en vez de tres

ACCEPTANCE CRITERIA (Functional):
  - [ ] Vista por proveedor con nº de líneas, importe estimado y hora de corte
  - [ ] Al abrir, cada línea muestra cantidad total y desglose por local
  - [ ] Puedo editar la cantidad total y añadir líneas no solicitadas
  - [ ] Puedo excluir líneas (vuelven a "pendiente" para el siguiente pedido)
  - [ ] El importe estimado usa last_known_price y se etiqueta como estimación

ACCEPTANCE CRITERIA (Experience):
  - [ ] El encargado siente control: nada se envía sin que él lo confirme
  - [ ] Fallo cubierto: proveedor con corte vencido aparece destacado, no oculto
  - [ ] Necesidad de información: quién pidió cada línea y cuándo

ACCEPTANCE CRITERIA (Visual):
  - [ ] Estados: sin solicitudes pendientes, corte próximo (<2h), corte vencido
  - [ ] El desglose por local es expandible, no ruido por defecto

PRIORITY: Must
EFFORT: M (4-6h)
DEPENDENCIES: MISE-001
```

```
STORY ID: MISE-003
JTBD: JTBD-2
STAGE: Envío

AS A: Encargado
I WANT TO: generar el pedido como mensaje y enviarlo por el canal del proveedor
SO THAT: el proveedor lo reciba como siempre, sin cambiar nada por su parte

ACCEPTANCE CRITERIA (Functional):
  - [ ] Genera texto plano legible: cabecera, líneas "cantidad × producto (unidad)",
        pie con local de entrega y contacto
  - [ ] Botones: "Abrir en WhatsApp" (deep link wa.me), "Abrir en correo" (mailto),
        "Copiar"
  - [ ] Al marcar como enviado: estado → 'enviado', se guarda message_snapshot,
        sent_by y sent_at, y las requests pasan a 'en_pedido'
  - [ ] Un pedido enviado es inmutable; corregir genera un pedido complementario

ACCEPTANCE CRITERIA (Experience):
  - [ ] Cero ambigüedad sobre si el pedido salió o no
  - [ ] Fallo cubierto: si se cierra WhatsApp sin enviar, el pedido sigue en
        borrador y avisa "aún no marcado como enviado"
  - [ ] El texto generado es revisable antes de enviar, siempre

ACCEPTANCE CRITERIA (Visual):
  - [ ] Vista previa del mensaje en monospace, tal cual se enviará
  - [ ] Estados: borrador, enviado (con marca de tiempo y autor)

PRIORITY: Must
EFFORT: M (4-6h)
DEPENDENCIES: MISE-002
```

```
STORY ID: MISE-004
JTBD: JTBD-1 / JTBD-2
STAGE: Recordatorio

AS A: Encargado
I WANT TO: recibir un aviso antes de la hora de corte de cada proveedor
SO THAT: ningún pedido se quede sin salir

ACCEPTANCE CRITERIA (Functional):
  - [ ] Cron diario que evalúa supplier_schedules
  - [ ] Aviso 2h antes del corte a encargados; aviso a baristas 4h antes
  - [ ] Canal: notificación push PWA, con email como reserva
  - [ ] Si el pedido ya está enviado, no se avisa

ACCEPTANCE CRITERIA (Experience):
  - [ ] El aviso lleva directo a la pantalla accionable, no al inicio
  - [ ] Nunca más de un aviso por proveedor y día

ACCEPTANCE CRITERIA (Visual):
  - [ ] Copy del aviso: proveedor + hora de corte + nº de líneas pendientes

PRIORITY: Should
EFFORT: M (4-6h)
DEPENDENCIES: MISE-003
```

## 4. Backlog — Bloque B "Recibir"

```
STORY ID: MISE-005
JTBD: JTBD-3
STAGE: Recepción

AS A: Encargado o Barista
I WANT TO: comprobar lo que llega contra lo que se pidió
SO THAT: las faltas y los cambios de precio no pasen inadvertidos

ACCEPTANCE CRITERIA (Functional):
  - [ ] Checklist de las líneas del pedido; por defecto "recibido completo"
  - [ ] Puedo ajustar cantidad recibida y marcar incidencia con motivo
  - [ ] Puedo introducir el precio real por línea (opcional, no bloquea)
  - [ ] Cada precio introducido escribe en price_history
  - [ ] Estado del pedido pasa a 'recibido_parcial' o 'cerrado' automáticamente

ACCEPTANCE CRITERIA (Experience):
  - [ ] Confirmar una entrega sin incidencias toma < 20 segundos (un solo toque)
  - [ ] El coste de reportar una incidencia es bajo; el de no reportarla, visible
  - [ ] Fallo cubierto: recepción a medias se puede retomar después

ACCEPTANCE CRITERIA (Visual):
  - [ ] Un toque para "todo correcto"; el detalle solo si se desvía
  - [ ] Estados: pendiente de recibir, parcial, cerrado, con incidencias

PRIORITY: Must
EFFORT: M (4-6h)
DEPENDENCIES: MISE-003
```

```
STORY ID: MISE-006
JTBD: JTBD-3
AS A: Encargado
I WANT TO: ver si el precio de un producto ha cambiado respecto a la última compra
SO THAT: pueda reclamar o renegociar en el momento

ACCEPTANCE CRITERIA (Functional):
  - [ ] Al introducir un precio que difiere >5% del último, se marca en la línea
  - [ ] El umbral es configurable por el operador
  - [ ] La desviación aparece en el panel del operador
ACCEPTANCE CRITERIA (Experience):
  - [ ] Aviso informativo, nunca bloqueante
ACCEPTANCE CRITERIA (Visual):
  - [ ] Indicador de subida/bajada con el porcentaje y el precio anterior
PRIORITY: Should
EFFORT: S (2-3h)
DEPENDENCIES: MISE-005
```

## 5. Backlog — Bloque D "Ver"

```
STORY ID: MISE-007
JTBD: JTBD-4
AS A: Operador
I WANT TO: ver el gasto por proveedor, por local y por categoría en el tiempo
SO THAT: pueda gestionar la compra con datos en vez de con sensaciones

ACCEPTANCE CRITERIA (Functional):
  - [ ] Gasto mensual por proveedor, local y categoría (basado en recepciones)
  - [ ] Evolución de precio por producto, con serie temporal
  - [ ] Productos con más incidencias en el periodo
  - [ ] Exportación a CSV
  - [ ] Filtro de rango de fechas; por defecto, últimos 90 días

ACCEPTANCE CRITERIA (Experience):
  - [ ] La primera pantalla responde a "¿en qué me estoy gastando el dinero?"
        sin configurar nada
  - [ ] Fallo cubierto: con menos de 4 semanas de datos, avisa de que la
        tendencia aún no es fiable en vez de mostrar una línea engañosa

ACCEPTANCE CRITERIA (Visual):
  - [ ] Escritorio primero; el operador mira esto sentado
  - [ ] Estados: datos insuficientes, cargando, sin datos en el rango

PRIORITY: Must
EFFORT: L (7-10h)
DEPENDENCIES: MISE-005
```

## 5.5 Backlog — Bloque C "Escandallo"

> Va dentro de v1 por decisión de producto (ver `CONTEXT.md` §7).
> Condición: las preguntas 11-17 de `CONTEXT.md` §8 deben confirmar que el Excel
> está a nivel de ingrediente. Si no lo está, MISE-008 se reduce a un importador
> de precios de producto y MISE-009 no se construye — pero v1 sale igualmente
> con los bloques A, B y D. El escandallo nunca bloquea la entrega.

### Modelo de datos adicional

```
recipes                  -- elaboraciones
  id uuid PK
  name text
  yield_qty numeric      -- cuántas raciones produce
  yield_unit text
  square_item_ref text null   -- mapeo manual al artículo de Square (Fase 4)
  active bool
  source enum('importado','manual')

recipe_lines
  id uuid PK
  recipe_id uuid FK
  product_id uuid FK null     -- null = sin mapear todavía
  raw_ingredient_name text    -- nombre original del Excel, se conserva siempre
  qty numeric
  unit enum('kg','l','ud')
  waste_pct numeric default 0 -- merma/rendimiento
  mapping_status enum('mapeado','ambiguo','sin_mapear')

recipe_cost_snapshots
  id uuid PK
  recipe_id uuid FK
  cost_total numeric
  calculated_at timestamptz
  trigger enum('recepcion','precio_manual','cambio_receta')
```

```
STORY ID: MISE-008
JTBD: JTBD-4
STAGE: Importación

AS A: Operador
I WANT TO: subir el escandallo que ya tenemos en Excel
SO THAT: no haya que reintroducir a mano lo que ya está hecho

ACCEPTANCE CRITERIA (Functional):
  - [ ] Importación de .xlsx/.csv con previsualización antes de confirmar
  - [ ] El importador NO asume estructura: el usuario mapea columnas
        (elaboración / ingrediente / cantidad / unidad / merma) en pantalla
  - [ ] Cada ingrediente se intenta emparejar automáticamente con un producto
        del catálogo por similitud de nombre; el resto queda 'sin_mapear'
  - [ ] Pantalla de resolución de mapeo: lista de ingredientes sin emparejar con
        buscador sobre el catálogo y opción "crear producto"
  - [ ] El nombre original del Excel se conserva siempre en raw_ingredient_name
  - [ ] Conversión de unidades explícita: si el escandallo pide gramos y se
        compra en sacos, el factor se define en el producto, no se adivina
  - [ ] Una elaboración con líneas sin mapear se importa igual, marcada como
        incompleta — nunca se descarta

ACCEPTANCE CRITERIA (Experience):
  - [ ] El operador siente que no está empezando de cero
  - [ ] Fallo cubierto: importación parcial es un resultado válido y visible,
        no un error
  - [ ] En todo momento se ve el % de la carta con escandallo completo
  - [ ] El sistema nunca presenta un coste como fiable si hay líneas sin mapear

ACCEPTANCE CRITERIA (Visual):
  - [ ] Escritorio primero
  - [ ] Estados: sin importar, importando, importado con incidencias, completo
  - [ ] Indicador de cobertura persistente (barra de % mapeado)

PRIORITY: Must (v1)
EFFORT: L (7-10h)
DEPENDENCIES: MISE-000, MISE-005
```

```
STORY ID: MISE-009
JTBD: JTBD-4
STAGE: Coste

AS A: Operador
I WANT TO: que el coste y el margen de cada elaboración se actualicen solos
           con cada recepción
SO THAT: el escandallo deje de ser una foto de un momento y sea un dato vivo

ACCEPTANCE CRITERIA (Functional):
  - [ ] Al registrar un precio en una recepción, se recalculan las elaboraciones
        que usan ese producto y se guarda un snapshot de coste
  - [ ] Vista de elaboración: coste por ración, PVP actual (manual), margen % y
        evolución del coste en el tiempo
  - [ ] Listado ordenable por margen, con alerta de elaboraciones cuyo coste ha
        subido >X% desde el último PVP fijado
  - [ ] Simulador: "si el precio de este producto sube un Y%, ¿qué elaboraciones
        se ven afectadas y cuánto?"
  - [ ] El coste solo se calcula sobre elaboraciones 100% mapeadas

ACCEPTANCE CRITERIA (Experience):
  - [ ] Responde a "¿qué he dejado de ganar sin darme cuenta?" sin configurar nada
  - [ ] Fallo cubierto: producto sin precio reciente → coste marcado como
        desactualizado con la fecha del último dato, nunca un número silencioso
  - [ ] Diferencia visible entre coste real (de recepciones) y estimado (importado)

ACCEPTANCE CRITERIA (Visual):
  - [ ] Serie temporal de coste por elaboración
  - [ ] Estados: sin datos de precio, coste estimado, coste real, desactualizado

PRIORITY: Must (v1)
EFFORT: M (4-6h)
DEPENDENCIES: MISE-008
```

---

## 6. Orden de construcción

v1 se entrega de una vez, pero se construye en este orden y no en otro.

1. Scaffold Next.js + Supabase + Prisma + shadcn/ui + auth con roles y RLS
2. MISE-000 (catálogo) — sin esto no hay nada que probar
3. MISE-001 (`/pedir`)
4. **PARADA OBLIGATORIA — prueba de pasillo (Gate 1).** Un barista real, su
   móvil, el catálogo real, un turno real. Se observa, no se explica. Si falla,
   se rediseña `/pedir` antes de tocar nada más. Ver `CONTEXT.md` §7.
5. MISE-002 → MISE-003 → MISE-004
6. MISE-005 → MISE-006
7. MISE-008 → MISE-009 (Gate 2: si el Excel no da para MISE-009, se salta sin
   mover la fecha de v1)
8. MISE-007 (el panel incluye márgenes solo si el paso 7 se construyó)
9. Entrega de v1 a los tres locales

### Definición de "terminado" para v1
- Los tres locales tienen usuarios reales y catálogo real cargado
- Un pedido completo ha recorrido el ciclo: solicitud → agregación → envío →
  recepción → precio registrado → coste de elaboración actualizado
- Todas las vistas tienen estado vacío, de carga y de error
- Desplegado en Vercel, instalable como PWA desde el móvil

## 7. Lo que este documento no cubre

Sin Service Designer ni Visual Designer sobre el proyecto, los criterios de
experiencia y visuales de arriba son mínimos razonables, no una especificación
de diseño. Antes del bloque D conviene una pasada de tokens y componentes si el
producto va a durar.
