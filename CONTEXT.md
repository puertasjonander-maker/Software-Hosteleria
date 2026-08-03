# CONTEXT.md — Mise (nombre de trabajo)

> Sistema de aprovisionamiento para Next Level Specialty Coffee (Málaga, 3 locales).
> Este fichero es el contexto de proyecto. Lo leen las role skills (PM, Frontend
> Engineer, Service Designer…) y Claude Code antes de actuar.

---

## 1. Qué es

Un sistema que sustituye el pedido manual y memorístico de género por un flujo
estructurado: el equipo de sala registra lo que falta desde el móvil, el sistema
agrupa las necesidades de los tres locales en un único pedido por proveedor, se
envía por el canal que ya usan (WhatsApp/email), y se registra lo que llega y a
qué precio.

**No es** un ERP de hostelería. No es un TPV. No sustituye a Square.

## 2. Por qué construirlo y no comprar uno

Hay que decirlo explícitamente porque es la primera objeción legítima: Yurest,
Haddock, Melba, MissTipsi, Gerentino o Apicbase ya hacen esto y más.

Razones válidas para construir:
- Usan **Square**, y el ecosistema español de gestión de hostelería está
  construido alrededor de TPVs españoles. Las integraciones que existen con
  Square apuntan a cadenas grandes.
- Las suites de mercado exigen **carga completa de escandallos e inventario**
  para dar valor. Aquí el valor llega el primer día sin ese trabajo previo.
- Es una **ayuda a un amigo**, no un negocio. El coste de construir es tiempo
  propio, no capital.

**Condición de parada honesta:** si al hacer el paso 0 (ver §7) resulta que el
dolor real es el control de coste de materia prima y no el caos de pedidos,
entonces la respuesta correcta es contratar Haddock o Yurest y no construir nada.
Esta decisión se toma ANTES de escribir código.

## 3. Usuarios

| Tipo | Quién | Qué necesita | Riesgo |
|---|---|---|---|
| **Barista** | Equipo de sala de cada local | Registrar faltas en 30 segundos, en medio del servicio | Si es más lento que un WhatsApp, no lo usa. Este es EL riesgo del proyecto. |
| **Encargado** | Responsable de compras | Ver lo agregado, ajustar, enviar a tiempo | Necesita confiar en que no falta nada |
| **Operador** | El socio-CTO | Histórico, gasto por proveedor, evolución de precios | Quiere datos, no pantallas |

## 4. JTBD centrales (los 4 que el MVP debe servir)

- **JTBD-1** — Cuando veo que falta género en mitad del turno, quiero dejarlo
  registrado sin parar lo que estoy haciendo, para no depender de acordarme luego.
- **JTBD-2** — Cuando llega el día de pedir a un proveedor, quiero saber
  exactamente qué necesitan los tres locales, para mandar un pedido único,
  correcto y a tiempo.
- **JTBD-3** — Cuando llega la mercancía, quiero comprobar que lo recibido y el
  precio coinciden con lo pedido, para que las desviaciones no pasen inadvertidas.
- **JTBD-4** — Cuando reviso el mes, quiero ver qué se ha comprado, a qué precio
  y cómo evoluciona, para decidir con datos y no con sensaciones.

## 5. Alcance

### DENTRO del MVP
- Catálogo de productos por proveedor y por local
- Solicitud de reposición desde móvil (por local)
- Agregación automática por proveedor con ventana de corte
- Generación y envío del pedido en texto plano (WhatsApp/email/copiar)
- Recepción: confirmar cantidades, precio real e incidencias
- Histórico de compras y evolución de precio por producto
- Roles y permisos (barista / encargado / operador)
- **Importación del escandallo existente en Excel, usado como motor de costes**
  (coste real por plato, recalculado con cada precio de recepción). No como
  motor de inventario.

### FUERA del MVP (Parking Lot)
| Feature | Por qué se aparta | Re-entry trigger |
|---|---|---|
| Creación y edición de recetas desde cero en la app | El trabajo caro es redactar el escandallo, no almacenarlo. Ya existe en Excel. | Cuando el Excel se quede corto y la app sea la fuente de verdad |
| Escandallo como motor de consumo (teórico vs vendido) | Requiere Square + modificadores + conteos de inventario. Es un cambio de hábitos, no una feature. | Cuando el escandallo importado (bloque C) esté cuadrado y en uso |
| Integración Square (ventas por artículo) | Requiere mapear cada artículo y modificador de Square a un escandallo | Después de v1, con el escandallo en uso |
| Inventario teórico vs real / varianza | Depende de los dos anteriores + registro disciplinado de mermas | Después de Square |
| Conteo de inventario físico | Trabajo operativo nuevo para el equipo; hay que ganárselo antes | Cuando el equipo pida el dato |
| Integración con proveedores (EDI/API) | Son proveedores locales; no existe tal cosa | Nunca, previsiblemente |
| OCR de albaranes | Bonito, no crítico. la recepción manual lo resuelve en 2 min. | Si la recepción manual se abandona por fricción |
| App nativa | PWA cubre el caso | — |

**La línea de corte:** el MVP termina cuando un pedido real se ha originado,
enviado y recibido íntegramente dentro del sistema, en los tres locales,
durante dos semanas seguidas.

## 6. Stack

- Next.js 14 (App Router) + TypeScript
- Supabase (Postgres + Auth + RLS)
- Prisma
- Tailwind + shadcn/ui
- Vercel
- PWA (instalable en el móvil del barista, sin app store)

## 7. Alcance de v1 y orden interno

**Decisión (2026-08-02):** v1 es una única entrega que incluye pedido, recepción,
escandallo importado y panel. No hay lanzamientos parciales al equipo.

Los bloques siguen existiendo como **orden de construcción interno**, no como
entregas separadas. El orden importa: cada bloque es entrada del siguiente.

| Bloque | Contenido | Estimación |
|---|---|---|
| **0. Validación** | Una semana dentro de la operación. Sin código. Salida: catálogo real de productos y proveedores, pautas de pedido, el Excel de escandallos en la mano, y una cifra en € del coste actual del caos. | 1 semana |
| **A. Pedir** | Solicitud → agregación → envío. JTBD-1 y 2. | ~20-25 h |
| **B. Recibir** | Recepción, precio real, incidencias. JTBD-3. | ~10-12 h |
| **C. Escandallo** | Importar el Excel, mapear ingredientes a productos, calcular coste y margen por elaboración. | ~10-14 h |
| **D. Ver** | Panel de histórico, precios y márgenes. JTBD-4. | ~8-10 h |
| **Post-v1. Sugerir** | Cantidades sugeridas por consumo histórico. Fuera de v1. | ~8 h |

**Total v1: ~50-60 h de construcción**, más la semana de Fase 0.

### La prueba de pasillo (no negociable)

Entregar v1 de una vez no significa esperar a v1 para probar. En cuanto `/pedir`
esté funcional (día 3-4 de construcción, antes de que exista nada más), se pone
en el móvil de un barista real con el catálogo real y se le observa usándola en
un turno. No es una demo: es él pidiendo de verdad.

Si esa prueba falla, se para y se rediseña `/pedir` antes de construir los
bloques B, C y D. Construir 50 horas sobre una pantalla que nadie usa es el
único modo real de que este proyecto fracase.

### Coste estimado vs coste real

Con el escandallo dentro de v1 aparece un problema que hay que resolver por
diseño, no por parche: al arrancar no existen recepciones, así que los precios
vienen del Excel. Por tanto:

- Todo coste tiene **procedencia explícita**: `estimado` (precio del Excel) o
  `real` (precio de una recepción registrada).
- Una recepción sobrescribe el precio estimado de ese producto y marca como
  `real` todas las elaboraciones que lo usan.
- La interfaz **nunca** presenta un coste estimado como si fuera real, y muestra
  siempre la fecha del último dato de precio.
- Una elaboración con ingredientes sin mapear no tiene coste: tiene un hueco.

### Riesgo asumido en esta decisión

El alcance de v1 pasa de ~30 h a ~50-60 h antes de que el equipo lo use en
producción. Se asume conscientemente porque el escandallo es lo que hace la
herramienta interesante para el socio-operador, no solo para el equipo de sala.
El contrapeso es la prueba de pasillo de arriba: es lo único que impide que el
proyecto se convierta en 60 horas de construcción sin contacto con el usuario.

## 8. Supuestos a confirmar en la Fase 0

Ninguna de estas está confirmada. Claude Code **no debe inventarlas**:

1. ¿Cuántos proveedores hay y cuáles son? ¿Cuántos productos por proveedor?
2. ¿Cómo se pide hoy exactamente: WhatsApp, teléfono, portal del proveedor?
3. ¿Cada local pide por separado o alguien centraliza ya?
4. ¿Hay pauta fija de días de pedido y entrega por proveedor?
5. ¿Los locales comparten almacén o hay trasvases entre ellos?
6. ¿Quién recepciona la mercancía y con qué papel (albarán, factura)?
7. ¿Los precios son fijos por acuerdo o varían por albarán?
8. ¿Qué plan de Square tienen y qué datos exportan hoy?
9. ¿Qué han probado ya y por qué lo dejaron?
10. ¿Cuántas personas por local tendrían acceso?

**Sobre el Excel de escandallos (condicionan el bloque C):**

11. ¿Está a nivel de ingrediente con cantidad y unidad por elaboración, o solo
    tiene un coste total estimado por producto? Si es lo segundo, no es
    importable: es una estimación, no un escandallo.
12. ¿Contempla merma y rendimiento (café molido, fruta pelada, pan que se seca)?
13. ¿Cubre los modificadores — leches vegetales, extra shot, tamaños? En
    specialty y brunch eso es la mitad de las variaciones del ticket.
14. ¿Los nombres de ingrediente coinciden con los productos que compran a
    proveedor, o son nombres libres?
15. ¿Los nombres de elaboración coinciden con los artículos del catálogo de Square?
16. ¿De cuándo son los precios que hay dentro? ¿Cuándo se actualizó por última vez?
17. ¿Cuántas elaboraciones tiene y qué % de la carta cubre?

## 9. Decision Gates

- **Gate 0 (fin Fase 0):** ¿Existe una cifra en € que justifique construir, y el
  dolor es el pedido y no el coste de materia prima? → Sí: construir. No: recomendar
  comprar Haddock/Yurest y cerrar el proyecto.
- **Gate 1 (prueba de pasillo, día 3-4 de construcción):** ¿Un barista registra
  faltas reales en `/pedir` sin ayuda y sin volver al WhatsApp? → Sí: seguir con
  B, C y D. No: parar y rediseñar. Este gate es el que protege las otras 40 horas.
- **Gate 2 (fin bloque C):** ¿El escandallo importado cubre ≥80% de la carta con
  todos sus ingredientes mapeados? → Sí: v1 sale completa. No: v1 sale sin el
  módulo de coste y el Excel se arregla en paralelo. La fecha de v1 no se mueve.
- **Gate 3 (2 semanas tras v1):** ¿Un pedido real ha salido íntegramente del
  sistema, en los tres locales, y el operador mira el panel sin que se lo pidan?
  → Sí: evaluar "Sugerir" y Square. No: parar, ya está entregado el valor.

## 10. Principios de diseño no negociables

1. **Registrar una falta tiene que costar menos que escribir un WhatsApp.** Si
   una pantalla añade un paso, se quita.
2. **Mobile-first literal.** Se usa de pie, con una mano, con prisa, a veces con
   las manos mojadas.
3. **Tolerante al fallo humano.** Pedir de más se corrige; no pedir no se detecta.
   Ante la duda, el sistema recuerda y avisa.
4. **Nadie escribe texto libre si puede pulsar.** El catálogo está precargado.
5. **El sistema nunca bloquea el servicio.** Si falla, se pide por WhatsApp y se
   registra después.
