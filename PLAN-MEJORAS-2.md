# PLAN-MEJORAS-2.md — lo que queda de la revisión del 14-sep-2026

Lo que sigue salió de una revisión a fondo de la aplicación (flujo de campo,
vistas de cliente y administración, rendimiento y una pasada visual) y **no** se
ha implementado. Va ordenado por lo que aporta dividido entre lo que arriesga.

Lo que se hizo en esa ronda está en los commits del 14-sep (valor del parque,
fallo de red que borraba pantalla, «todo subido» mentiroso, roce que cerraba el
parte, borrar foto con deshacer, añadir máquina sobre la marcha, la máquina
pedida con su box, panel de boxes activos, última visita del cliente, próxima
visita y contador de pasos).

---

## 1 · Sin cobertura, recargar deja la visita inservible

**El problema.** La pantalla de trabajo se construye entera desde el servidor
(`obtenerVisita`, tres consultas) y el service worker no cachea datos a
propósito. iOS recarga la pestaña al volver de la cámara o al quedarse sin
memoria: dentro del box, la pantalla pasa a ser un error, no se ve qué queda y
los partes cerrados en local vuelven a aparecer como pendientes, así que el
técnico los repite. La cola está intacta, pero él no puede saberlo.

**El arreglo.** Guardar en IndexedDB un retrato de la visita con sus partes al
cargarla bien, y una marca de los partes cerrados en local. Al arrancar, pintar
el retrato y refrescar detrás, sin depender de la red para enseñar la visita.

**Riesgo.** Alto: toca la cola local, el fichero más delicado del proyecto.

## 2 · Los minutos nunca se registran

`partes.minutos` se escribe siempre a null y `minutosObjetivo` del protocolo no
lo lee nadie. El presupuesto de sesenta segundos por máquina —el supuesto que
decide el proyecto— no se puede medir nunca. Arreglo: cronómetro invisible (de
abrir la hoja a pulsar «Terminada») y comparación con el objetivo en el
histórico del técnico. Riesgo bajo.

## 3 · Qué falta en la cola y por qué

Cuando una foto no sube, el contador dice cuántas quedan pero no cuál falla, y
nadie se entera hasta que el cliente no ve el trabajo. Arreglo: guardar los
intentos por ítem y enseñar «1 foto no sube» con opción de reintentar o
descartar. Riesgo medio.

## 4 · «Vencida» significa dos cosas

`listarBoxes` cuenta vencida si `proxima_revision <= hoy`; `resumirParque` cuenta
`diasHastaRevision < 0` y manda el 0 a «próximas». Una máquina que toca hoy es
«1 vencida» en la lista de boxes y «en 30 días» en la ficha del box. Arreglo: una
sola definición, la de la vista. Riesgo bajo, pero hay que decidir cuál es.

## 5 · El panel no ve las visitas que vienen

La consulta del panel corta en `lte('fecha', hasta)`, así que una visita
planificada a futuro no cuenta en ninguna cifra y Jon no ve su carga
planificada. Arreglo: quitar el tope superior y separar lo hecho de lo
planificado. Riesgo bajo.

## 6 · Peso del bundle

679 kB (198 kB gzip) en un solo chunk, más `xlsx` (429 kB) y `papaparse`. En un
móvil sin cobertura, la primera carga es lo que decide si la app se instala.
Arreglo: comprobar que `xlsx` y `papaparse` solo entran al importar un fichero,
y trocear por ruta. Riesgo bajo, pero hay que medir antes y después.

## 7 · PWA: que una versión nueva llegue

Sin comprobar: qué cachea el service worker y si el usuario se entera de que hay
versión nueva. En una herramienta que se instala en el móvil, quedarse en una
versión vieja sin avisar es un fallo silencioso. Arreglo: aviso de actualización.

---

## Descartado, y por qué

- **Quitar el valor del parque de la vista del cliente.** Una auditoría lo
  propuso; Jon lo pidió expresamente, así que se queda.
- **Contraste de los chips y de los textos pequeños.** La revisión visual lo
  marcó a ojo tres veces; medido con la fórmula WCAG da entre 4,6:1 y 8,4:1, todo
  AA. No se toca.
- **La barra inferior «a media pantalla».** Es un artefacto de las capturas de
  página completa: es `fixed` y el hueco está reservado con `pb-24`. Hay una
  aserción que lo mide para no volver a perseguirlo.