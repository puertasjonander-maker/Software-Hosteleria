# Análisis visual y de UX — Mise

Fecha: 2026-09-23. Revisión de todas las pantallas de la v1 (`/pedir`, `/pedidos`,
detalle y envío de pedido, recepción, escandallo, panel, administración y acceso)
contra los principios de `CONTEXT.md` §10: registrar una falta tiene que costar
menos que un WhatsApp, mobile-first literal (de pie, con una mano, con prisa) y
tolerancia al fallo humano.

## Punto de partida

La base es sólida y ya tiene una intención de diseño explícita:

- **Sistema de tokens corto y con significado**: neutros cálidos, `primary` para
  acción, `ok` para dato real, `warn` para estimado o corte próximo, `destructive`
  para vencido o incidencia. Modo oscuro que sigue al sistema.
- **Escala tipográfica de siete escalones** (`titulo-pantalla`, `titulo-seccion`,
  `titulo-tarjeta`, `cifra-dato`, `texto-meta`…) y un sistema de movimiento de
  tres duraciones y tres curvas, con `prefers-reduced-motion` tratado con cuidado.
- **`/pedir` muy trabajada**: stepper de 44 px, guardado sin botón, cola sin red,
  corte urgente como franja, raíl de «esto lo llevas».
- **Procedencia del coste siempre visible** (real / estimado / hueco).

Los problemas no están en la base, sino en que el cuidado de `/pedir` no llegó
igual a las demás pantallas, y en algunos flujos que se quedan a un paso de
resolver el trabajo.

## Hallazgos

Prioridad: **A** = afecta a una tarea central o puede provocar un error real;
**B** = fricción o incoherencia visible; **C** = pulido.

### Flujo de pedir (barista)

| # | Hallazgo | Prioridad |
|---|---|---|
| 1 | Con un catálogo de cientos de productos, la única forma de llegar a una categoría es buscar o deslizar la lista entera. | A |
| 2 | El recuento «N productos» ocupa sitio en la franja fija y no ayuda a decidir nada. | C |
| 3 | «Buscar» en el teclado del móvil no cierra el teclado; los resultados quedan tapados. | C |

### Bandeja de pedidos y detalle (encargado)

| # | Hallazgo | Prioridad |
|---|---|---|
| 4 | «En curso» no distingue un pedido que debía llegar ayer de uno de la semana que viene; está ordenado por fecha de creación. | A |
| 5 | Para recepcionar hay que entrar al pedido y luego a recepción: el día del camión son dos pantallas de más. | B |
| 6 | En el móvil, «← Pedidos» / «← Volver al pedido» / «← Elaboraciones» repiten el «atrás» de la cabecera y cuestan una fila. | B |
| 7 | El detalle de un pedido enviado tenía dos accesos a recepción («Recepción» arriba y «Recepcionar» abajo), y un pedido cerrado seguía invitando a «Recepcionar». | B |
| 8 | El estado del pedido se pintaba con dos mapas de estilos copiados que ya habían empezado a divergir. | C |
| 9 | «Descartar borrador» usaba `window.confirm`: diálogo del navegador con el dominio encima y botones pequeños. | B |
| 10 | El botón de quitar línea medía 36 px en el móvil (la regla del proyecto es 44). | B |
| 11 | Estas pantallas usaban `text-xs`/`text-sm` sueltos y no la escala; el importe total medía lo mismo que un texto de apoyo. | C |

### Envío del pedido

| # | Hallazgo | Prioridad |
|---|---|---|
| 12 | **Error real:** el contacto guardado es el del canal habitual del proveedor, pero se usaba con cualquier canal. Cambiar a «Correo» metía un número de teléfono en el `mailto:`, y «Teléfono» sin número abría un `tel:` vacío. | A |
| 13 | «Marcar como enviado» era el botón lleno desde el principio, antes incluso de abrir WhatsApp: invitaba a marcar sin mandar, que es justo la ambigüedad que este paso quiere quitar. | A |
| 14 | No se veía a dónde iba a ir el mensaje hasta pulsar. | B |

### Recepción

| # | Hallazgo | Prioridad |
|---|---|---|
| 15 | Al plegar una línea, el precio, la incidencia o la nota anotados desaparecen: no hay forma de revisar lo anotado sin abrir línea por línea. | A |
| 16 | Antes de «Confirmar recepción» no hay resumen de lo que se va a guardar. | B |
| 17 | El selector de local ocupaba una fila del formulario (en `/pedir` ya vivía en la cabecera). Y el local en el que se recibe no se decía en claro. | B |
| 18 | El botón de desplegar una línea medía 36 px. | B |

### Escandallo, panel y administración

| # | Hallazgo | Prioridad |
|---|---|---|
| 19 | La lista de elaboraciones es una tabla de siete columnas: en un móvil hay que desplazarla de lado para ver el margen, que es lo que se viene a mirar. | A |
| 20 | El orden («Por margen / coste / nombre») eran tres botones sueltos de 36 px; no se leía como una opción excluyente. | C |
| 21 | El margen se coloreaba (ámbar < 60 %, rojo < 40 %) en la lista pero no en la ficha de la elaboración. | B |
| 22 | Las cifras de resumen estaban escritas a mano con dos tamaños distintos (`text-2xl` y `text-[1.75rem]`). | C |
| 23 | Las siete pestañas de administración se partían en tres renglones en el móvil, con el subrayado de la activa descolocado. | B |
| 24 | En el panel, la columna «Peso» es un porcentaje: una columna de números no se compara de un vistazo. | C |
| 25 | El KPI de incidencias es un recuento sin base: 12 no dice si es mucho o poco. | C |

### Transversal

| # | Hallazgo | Prioridad |
|---|---|---|
| 26 | La navegación inferior y las pestañas no mostraban el foco de teclado. | B |
| 27 | La cruz de cerrar los diálogos era un objetivo de 20 px. | B |
| 28 | La contraseña no se podía ver al escribirla (móvil, de pie, a veces con las manos mojadas), y el error no se borraba al corregir. | B |

## Cambios hechos

Todos en el front, sin tocar esquema ni acciones de servidor.

- **Saltos por categoría en `/pedir` (1, 2, 3).** La fila del filtro se convierte
  en una fila deslizable: «Lo que llevo hoy» y después una píldora por categoría,
  con el número de productos que llevas en cada una. Tocar una categoría baja
  hasta ella (con el alto real de la franja fija medido en el momento), y la
  categoría que tienes debajo se enciende al desplazar. Cada píldora mide 44 px
  de objetivo aunque se dibuje a 32. La franja fija queda prácticamente con el mismo alto que tenía.
  «Buscar» cierra el teclado y el número de resultados se anuncia al lector de
  pantalla.
- **Entregas en la bandeja (4, 5).** «En curso» se ordena por urgencia de entrega:
  atrasados (raíl rojo, «Debía llegar ayer · sin recibir»), los que llegan hoy
  (raíl ámbar) y después borradores y el resto. Los pedidos enviados llevan un
  botón **Recibir** que va directo a la recepción, lleno cuando la entrega es hoy
  o está atrasada.
- **Navegación sin duplicados (6, 7).** El «atrás» de contenido solo aparece en
  escritorio. El pedido enviado tiene una sola entrada a recepción y, si está
  cerrado, dice «Ver recepción» en un botón secundario.
- **`EtiquetaEstadoPedido` (8).** Un componente para el estado del pedido.
- **Diálogo propio para descartar (9)**, que dice cuántas líneas vuelven a la
  bandeja, y botones de 44 px en el móvil (10, 18).
- **Escala tipográfica aplicada** a detalle, envío, recepción, panel y ficha de
  elaboración (11); importes con `cifra-dato` y resúmenes con la nueva
  `cifra-kpi` (22).
- **Envío (12, 13, 14).** El contacto solo se usa con su canal; «Llamar» se
  desactiva sin número. Hasta abrir el canal, la acción principal es «Abrir en
  WhatsApp»; después pasa a serlo «Marcar como enviado». Debajo de los botones se
  ve el destino, o qué pasará si no hay contacto guardado.
- **Recepción (15, 16, 17).** Las líneas plegadas enseñan lo anotado (precio,
  incidencia y nota como etiquetas; el precio en ámbar si se desvía más del
  umbral). Encima de «Confirmar» hay un resumen en vivo («1 línea con falta · 1
  precio anotado»). El local va en la cabecera, como en `/pedir`, y el subtítulo
  dice «Recibes en …».
- **Escandallo (19, 20, 21).** En el móvil, tarjetas con nombre y margen arriba y
  coste, PVP y procedencia debajo; la tabla queda para escritorio. El orden es un
  control segmentado. `claseMargen` colorea el margen igual en lista, tarjetas y
  ficha.
- **Pestañas de sección (23).** Una sola fila que se desplaza, con la activa
  traída a la vista. El indicador se mide con el desplazamiento.
- **Panel (24, 25).** Barra de peso bajo cada nombre en los desgloses (una serie,
  un color validado, `--chart-1`; la cifra sigue en texto) y porcentaje de
  líneas con incidencia.
- **Accesibilidad (26, 27, 28).** Foco visible en navegación y pestañas,
  `aria-current` en la navegación de escritorio, cruz de cierre de 44 px y
  botón para ver la contraseña (el error se borra al corregir).

## Lo que queda fuera (propuestas)

- **Deshacer al excluir una línea del borrador.** Hoy el toast confirma pero no
  deshace. Hacerlo bien exige una acción de servidor que devuelva la línea con su
  desglose y sus solicitudes, no un «añadir» nuevo.
- **Stepper en la cantidad recibida.** En recepción la cantidad se escribe;
  un «− / +» alrededor del campo ahorraría abrir el teclado en el caso más común
  (faltó una caja).
- **Comparación con el periodo anterior en el panel.** Una segunda consulta con el
  rango desplazado; útil, pero cambia el contrato de datos del panel.
- **La prueba de pasillo sigue pendiente.** Ninguno de estos cambios sustituye
  ver a un barista real usando `/pedir` en un turno (Gate 1). Los saltos por
  categoría en concreto conviene validarlos ahí: si el catálogo real de un local
  tiene pocas categorías, la fila apenas aporta.
