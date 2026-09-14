# PLAN-MEJORAS-2.md — lo que queda de la revisión del 14-sep-2026

Aquí queda **solo lo que no está hecho**. Hecho y en producción el 14-sep: el valor
del parque, el fallo de red que borraba la pantalla, «todo subido» que mentía, el
roce que cerraba el parte sin guardar, borrar foto con deshacer, añadir máquina
sobre la marcha, la máquina pedida con su box, el panel de boxes activos, la última
visita del cliente, la próxima visita, el contador de pasos, el nº de serie primero,
**la aplicación funcionando sin cobertura**, los **minutos por máquina**, una sola
definición de **vencida**, la **agenda en el panel** y **cuál es la foto que no
sube**.

---

## 1 · Peso del bundle

683 kB (198 kB gzip) en un solo chunk, más `xlsx` (429 kB) y `papaparse`. En un
móvil sin cobertura, la primera carga decide si la app se acaba instalando en el
móvil del técnico.

**El arreglo.** Comprobar que `xlsx` y `papaparse` solo entran al importar un
fichero y trocear por ruta. Medir antes y después: si no baja de forma clara, no
merece el riesgo.

**Riesgo.** Bajo.

## 2 · PWA: que una versión nueva llegue

Sin comprobar: qué cachea el service worker y si el usuario se entera de que hay
versión nueva. Hoy hay que cerrar y reabrir a mano, y en una herramienta instalada
quedarse en una versión vieja sin avisar es un fallo silencioso.

**El arreglo.** Aviso de actualización cuando el service worker tenga versión nueva.

**Riesgo.** Bajo-medio: toca `sw.js`.

---

## Sin implementar a propósito, y por qué

- **Quitar el valor del parque de la vista del cliente.** Lo propuso una auditoría;
  Jon lo pidió expresamente.
- **Contraste de chips y textos pequeños.** Marcado a ojo tres veces por la revisión
  visual; medido con la fórmula WCAG da 4,6:1–8,4:1, todo AA.
- **La barra inferior «a media pantalla».** Artefacto de las capturas de página
  completa: es `fixed` y el hueco está reservado con `pb-24`. Hay una aserción que lo
  mide.
- **Cronometrar en un box de verdad.** Es lo único que cierra la fase 2 y no lo puede
  hacer un agente. Ahora los minutos se registran solos, así que la primera visita
  real dará el dato.
