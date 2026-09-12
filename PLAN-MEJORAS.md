# PLAN-MEJORAS.md — las cinco de después del lanzamiento

Cinco peticiones tras usar Ergobox con un cliente real. Van ordenadas por lo que
aportan dividido entre lo que arriesgan, no por el orden en que se pidieron.

Dos de ellas dependen de algo que hay que dar de alta fuera (una integración de
Notion y un servicio de correo). Las dos se construyen de manera que la
aplicación funcione igual sin eso: si falta el secreto, el botón no aparece. No
hay ningún paso en el que Ergobox deje de funcionar esperando a un tercero.

---

## Fase A · Cómo se lee el semáforo *(nada externo, cero riesgo)*

### A1 · «Urgente» es demasiado

Hoy el rojo se llama **Urgente**. Delante del dueño de un box, en su pantalla,
eso suena a evacuar el local. La palabra tiene que decir la verdad sin gritar.

| Estado | Antes | Ahora |
|---|---|---|
| `verde` | Correcta | Correcta |
| `ambar` | Atención | A vigilar |
| `rojo` | Urgente | **Para arreglar** |
| `sin_revisar` | Sin revisar | Sin revisar |

`Para arreglar` dice qué hay que hacer, no cómo hay que sentirse. Y sigue siendo
rojo: el color ya carga la urgencia, la palabra no tiene que repetirla.

El importador sigue aceptando `urgente` como sinónimo de rojo en un CSV. Lo que
cambia es lo que se enseña, no lo que se entiende.

### A2 · La próxima revisión, en la unidad que toca

Hoy todo se cuenta en días: «en 47 días» obliga a dividir entre treinta mentalmente.
La regla nueva, tal y como se pidió:

| Cuánto falta | Se lee |
|---|---|
| Más de 30 días | «en 2 meses» |
| De 8 a 30 días | «en 3 semanas» |
| De 1 a 7 días | «en 5 días» |
| Hoy | «toca hoy» |
| Vencida | «13 días tarde», y se pinta como aviso |

El único caso que cambia de tono es el último. Mientras falta, es información;
cuando ha vencido, es un aviso, y por eso se dice el retraso y no la fecha.

---

## Fase B · La cadencia la decide quien ha tocado la máquina

Hoy `cadencia_meses` se teclea en la ficha de la máquina, normalmente al darla de
alta y sin haberla abierto todavía. Quien sabe cada cuánto hay que volver es el
técnico que acaba de limpiarla, y lo sabe justo en ese momento.

- `partes.cadencia_sugerida_meses`, nueva columna. Al cerrar el parte, el técnico
  elige en meses: 1, 2, 3, 4, 6, 12, o «sin recurrencia».
- El trigger `aplicar_parte_hecho` la copia a `maquinas.cadencia_meses`, y
  `proxima_revision` se recalcula sola como ya hacía.
- Queda en el parte además de en la máquina a propósito: la ficha dice cuál es la
  cadencia hoy, el histórico dice quién la decidió y cuándo.

Por defecto se propone la que ya tenga la máquina. En el caso normal, cero toques.

---

## Fase C · Fotos del antes al inventariar

Hoy una foto cuelga de un parte. Al inventariar por primera vez no hay parte
todavía, así que el estado inicial de una máquina se queda sin prueba gráfica,
que es justo cuando más falta hace: es la foto que demuestra cómo llegó.

- `fotos.parte_id` pasa a admitir nulos y aparece `fotos.maquina_id`, con la regla
  de que va uno de los dos y nunca los dos a la vez.
- Las fotos de máquina van a `<cliente_id>/maquinas/<maquina_id>/<uuid>.jpg`.
- Las políticas de lectura del bucket y de la tabla aprenden el camino nuevo.
- La cola de subida deja de estar atada a un parte: pasa a llevar un destino, que
  es un parte o una máquina. Sigue habiendo **un solo camino** de escritura, que
  es lo que hace que el de sin cobertura esté probado.

Es la fase que toca el fichero más delicado del proyecto, la cola local. Va
después de las dos anteriores por eso.

---

## Fase D · El correo de alta *(necesita un servicio de correo)*

Hoy dar de alta a alguien enseña una contraseña una sola vez y hay que pasarla por
WhatsApp. Funciona, pero no se parece a la primera impresión que queremos dar.

- El alta pasa a tener dos tiempos: se rellenan los datos, se revisan, y solo
  entonces se envía. Lo pidió así y es lo correcto: un correo no se puede
  recuperar.
- Se puede dar de alta también a un **técnico**, no solo a un dueño de box. Hoy la
  función solo sabe crear clientes.
- El correo sale de `hola@ergobox.es`, con la identidad de Ergobox, y lleva
  dentro el acceso y un botón a `app.ergobox.es`.

**Lo que hay que dar de alta fuera:** una cuenta de Resend, verificar
`ergobox.es` añadiendo unos registros DNS en Hostinger, y guardar la clave como
secreto de la función. Sin ese secreto, el alta se comporta exactamente como hoy:
enseña la contraseña y no intenta mandar nada.

---

## Fase E · Importar el parque desde Notion *(necesita una integración)*

El parque real ya está en Notion, en una base por box. La de IronBuster tiene
esta forma, y de aquí sale el mapeo:

| En Notion | En Ergobox |
|---|---|
| `Máquina` (título) | `nombre` |
| `Tipo` (RowErg, BikeErg, SkiErg, Assault / Echo, Barra olímpica, Otro) | `tipo` |
| `Nº serie` | `num_serie` |
| `Estado` (Por revisar, Ámbar, Rojo, Verde, Servicio hecho) | `estado` |
| `Notas` | `notas` |
| `Fecha de servicio` | `ultima_revision` |

`Servicio hecho` entra como verde y `Por revisar` como sin revisar, que es lo que
significan. Damper, drag factor, importes y trabajo hecho se quedan fuera: eso es
de un parte, no de la ficha de una máquina.

**La pieza que falta es un secreto, no un servidor.** Leer Notion exige un token
que no puede bajar al navegador, así que lo hace una función. Pero la función solo
**lee y devuelve filas**: el alta de las máquinas la sigue haciendo el navegador
con la sesión de quien pulsa, pasando por las mismas políticas y por el mismo
previsualizador que ya usa el CSV. Así el camino de escritura probado no se
duplica, y la clave de servicio no entra en la importación.

**Lo que hay que dar de alta fuera:** una integración interna de Notion,
compartir con ella las bases de máquinas, y guardar su token como secreto.

---

## El orden, y por qué

1. **A** — se ve enseguida, no puede romper nada, y es lo que va a mirar el cliente.
2. **B** — una columna y un selector. Cambia quién decide la cadencia.
3. **C** — toca la cola local. Antes conviene tener A y B asentadas.
4. **D** — depende de un alta externa; el código se puede dejar listo antes.
5. **E** — lo mismo, y además es la que más superficie nueva añade.

Cada fase se cierra igual que las anteriores: `typecheck`, `lint`, `build`, las
pruebas de pantalla contra el build, y las pruebas SQL cuando toque el esquema.
La prueba de aislamiento se vuelve a pasar en las fases C y E, que son las que
tocan políticas.
