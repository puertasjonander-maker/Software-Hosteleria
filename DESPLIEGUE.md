# DESPLIEGUE.md — Ergobox en `app.ergobox.es`

Cómo pasar de este repositorio a algo que Antonio pueda abrir desde el móvil, sin
tocar la web de ergobox.es que ya está publicada.

---

## Estado a 12 de septiembre de 2026

Lo que ya está hecho y no hay que volver a hacer:

| | Qué | Dónde |
|---|---|---|
| ✅ | Proyecto de Supabase creado | ref `pbepyegrmajoozplpjxy`, región eu-west-1 |
| ✅ | Las nueve migraciones aplicadas | §2.2 |
| ✅ | Prueba de aislamiento pasada contra el Supabase real | §2.3 |
| ✅ | Las dos funciones desplegadas | §2.4 |
| ✅ | Primer administrador creado | §2.7 |
| ✅ | `dist/` construido con su `config.json` | §2.5 |
| ⬜ | Subir `dist/` al subdominio y activar el SSL | §3.1 |
| ⬜ | Revocar la clave de Hostinger | §0 |
| ⬜ | Avisos de revisión: secretos VAPID y cron | §2.6 |

Los avisos son lo único que queda a medias, y la aplicación funciona entera sin
ellos: la pantalla de ajustes dice que faltan en vez de romperse.

---

## 0. Antes que nada: la llave de Hostinger está publicada

En el repositorio de la web (`ergo-box-website`, que es **público**) hay un fichero
`DEPLOYMENT.md` con una clave de la API de Hostinger escrita en claro.

Dicho sin tecnicismos: **eso es la llave de tu panel de Hostinger, y está colgada
en internet donde cualquiera puede leerla.** Con ella se pueden tocar dominios,
DNS y ficheros de tu hosting. Los robots que rastrean GitHub buscando claves
tardan horas, no meses.

Qué hacer, en este orden:

1. **Entra hoy al hPanel de Hostinger y revoca esa clave.** Es lo único que la
   desactiva de verdad.
2. Crea una nueva si la necesitas, y guárdala en el gestor de contraseñas o en las
   variables de entorno del despliegue. Nunca en un fichero del repositorio.
3. Borra la línea del `DEPLOYMENT.md`.

**Borrar la línea no es suficiente por sí solo.** Git guarda todas las versiones
anteriores de cada fichero: la clave sigue estando en el historial y se puede leer
igual. Por eso el paso 1 es el que importa; el 3 solo evita repetir el error.

---

## 1. Cómo queda montado

| Dirección | Qué es | Dónde vive |
|---|---|---|
| `ergobox.es` | La web actual, la que capta clientes | Hostinger, sin tocar |
| `app.ergobox.es` | Esta aplicación, un montón de ficheros estáticos | Donde quieras (§3) |
| — | Base de datos, usuarios y fotos | Supabase |

**La aplicación no necesita servidor.** `npm run build` deja en `dist/` un
`index.html`, un CSS y un par de ficheros JavaScript. Eso es todo: se descarga
entera en el móvil y desde ahí habla directamente con Supabase.

Que hable directa con Supabase no la hace menos segura. Quien decide qué datos
salen son las políticas de la base de datos, que resuelven quién eres a partir de
tu token, y deciden lo mismo venga la consulta de donde venga. La prueba de eso
está escrita y se pasa en un comando: §2.3.

**Por qué un subdominio y no `ergobox.es/app`.** Con una carpeta habría que
mezclar dos cosas que se despliegan por separado en el mismo sitio. Un subdominio
es un registro de DNS y un enlace en el menú, y se deshace borrando el registro.

---

## 2. Supabase

### 2.1 Crear el proyecto

**Ya está creado**: referencia `pbepyegrmajoozplpjxy`, región eu-west-1. Lo que
sigue es la receta, por si algún día hay que levantar otro.

Región **eu-west** (Irlanda o Fráncfort): los datos son de clientes españoles y el
servidor conviene tenerlo cerca, tanto por latencia como por el RGPD.

### 2.2 Aplicar las migraciones

```bash
supabase link --project-ref <tu-project-ref>
supabase db push
```

Sin la CLI, pega los ficheros de `supabase/migrations/` en el SQL Editor **en
orden de nombre**. Ninguno es opcional:

| Fichero | Qué deja |
|---|---|
| `..._esquema.sql` | Tablas, enums y el trigger de alta de perfil |
| `..._logica.sql` | Próxima revisión, cierre de parte, cierre de servicio, vista del parque |
| `..._rls.sql` | **Row Level Security.** Es lo único que separa un box de otro |
| `..._almacenamiento.sql` | Bucket privado de fotos y sus políticas |
| `..._vista_parque_completa.sql` | Tres columnas que faltaban en la vista |
| `..._historico.sql` | Cambios de estado, bajas y validación de anotaciones |
| `..._email_perfil.sql` | El correo copiado al perfil, para no leerlo con la clave de servicio |
| `..._avisos.sql` | A quién avisar y de qué, con la regla que evita repetirse |
| `..._permisos_funciones.sql` | Quita de la API pública las funciones que no pinta nadie ahí |

### 2.3 Comprobar que el aislamiento funciona

Dos maneras, la misma prueba:

**Sin instalar nada.** Abre *SQL Editor* en el panel de Supabase, pega entero
`scripts/probar-aislamiento-editor.sql` y pulsa *Run*.

**Con `psql`**, usando la cadena de conexión de *Project Settings → Database*:

```bash
psql "<cadena-de-conexion>" -v ON_ERROR_STOP=1 -f scripts/probar-aislamiento.sql
```

Tiene que terminar en `TODO EN ORDEN`. **Si falla, no des acceso a ningún cliente
hasta arreglarlo**: en esta arquitectura las políticas no son una capa más, son la
única.

Un detalle de la versión del editor que despista: **`TODO EN ORDEN` sale en rojo,
como si fuera un error, y significa que ha ido bien.** Es a propósito. Reventar al
final es lo que hace que se deshaga la siembra de prueba y no quede ni un box
inventado en la base de datos. Lo que hay que mirar es el texto: si empieza por
`FALLO ·`, ha ido mal.

**Pasada el 12 de septiembre de 2026 contra `pbepyegrmajoozplpjxy`**: 52
comprobaciones, ninguna fila de un box asomando en las consultas del otro, ninguna
escritura de cliente aceptada, y la base de datos vacía al terminar.

Hay que repetirla cada vez que se toque una política, y otra vez antes de dar de
alta al primer usuario de un box nuevo.

### 2.4 Desplegar las dos funciones

Son las únicas piezas del producto que corren fuera del navegador, y las dos
existen por lo mismo: necesitan la clave de servicio, que no puede bajar al móvil
de nadie.

**Las dos están desplegadas** en `pbepyegrmajoozplpjxy`, versión 1. Para volver a
subirlas después de tocarlas:

```bash
supabase functions deploy alta-usuario
supabase functions deploy avisar-revisiones
supabase secrets set ORIGEN_PERMITIDO=https://app.ergobox.es
```

La clave de servicio ya está disponible dentro de las funciones sin configurarla:
Supabase la inyecta. `ORIGEN_PERMITIDO` no es imprescindible, pero sin él aceptan
peticiones desde cualquier página, y ese sí conviene ponerlo en cuanto el
subdominio esté en pie.

Sin `alta-usuario` la aplicación funciona entera menos el botón de dar de alta a
un dueño de box. Sin `avisar-revisiones`, menos los avisos.

### 2.5 La configuración de la aplicación publicada

La aplicación publicada **no lee variables de entorno**: lee un fichero
`config.json` que va junto a `index.html` en el servidor. Así cambiar de proyecto
de Supabase es editar tres líneas por FTP, sin reinstalar Node ni reconstruir
nada. La plantilla está en `public/config.example.json`.

```json
{
  "supabaseUrl": "https://pbepyegrmajoozplpjxy.supabase.co",
  "supabaseAnonKey": "<la clave anon, de Project Settings → API>",
  "vapidPublicKey": ""
}
```

Los tres valores viajan al navegador y se pueden leer. No pasa nada: la clave
anónima es pública por diseño y no concede nada por sí sola —quien decide qué
datos salen son las políticas de §2.3— y la VAPID pública es literalmente la mitad
pública de un par de claves.

`vapidPublicKey` se deja vacía hasta haber puesto los secretos de §2.6. Con la
clave puesta y los secretos sin poner, el botón de aviso de prueba daría un error
de servidor; vacía, la pantalla dice que los avisos no están disponibles, que es
la verdad y se entiende.

Si el fichero falta o está roto, la aplicación no se queda en blanco: enseña qué
falta y con qué forma.

**En desarrollo** sí valen las variables de entorno, con prefijo `VITE_` y en
`.env.local`; el fichero `.env.example` las lista. **Si alguna vez ves una
variable `VITE_` con la palabra `service` o `secret` en el nombre, es un incidente
de seguridad y no una configuración.**

### 2.6 Los avisos de revisión

Hacen falta un par de claves VAPID, que es lo que demuestra a los servicios de
push (Google, Apple, Mozilla) que el aviso viene de nosotros:

```bash
npx web-push generate-vapid-keys
```

La pública va al `config.json` del servidor como `vapidPublicKey`. La privada, al
entorno de la función, junto con un secreto inventado que es lo que distingue una
llamada del cron de una llamada de cualquiera:

```bash
supabase secrets set VAPID_PRIVATE_KEY=...
supabase secrets set VAPID_PUBLIC_KEY=...
supabase secrets set VAPID_SUBJECT=mailto:hola@ergobox.es
supabase secrets set CRON_SECRET=<una cadena larga inventada>
```

Después se programa el aviso diario. La vía cómoda es el panel de Supabase, en
*Integrations → Cron*, creando un job que invoque `avisar-revisiones` una vez al
día y añadiendo a mano la cabecera `x-cron-secret`. La vía en SQL, con sus
comentarios, está en `supabase/cron/programar-avisos.sql`.

**Para comprobar que llega**, no hace falta esperar a que a una máquina le toque:
entra en `/ajustes` desde el móvil, activa los avisos y pulsa "enviarme una de
prueba". Si llega, el camino entero funciona.

### 2.7 El primer administrador

**Ya está creado**, con el correo `puertas.jonander@gmail.com` y rol `admin`. La
contraseña temporal se entregó aparte y **hay que cambiarla al entrar**: está
escrita en una conversación, que es exactamente donde no debe vivir una
contraseña para siempre.

El resto de altas se hacen desde `/admin`, pero esa pantalla exige ser
administrador, así que el primero se pone a mano una vez:

1. *Authentication → Users → Add user*, con contraseña y confirmando el correo.
2. *Table editor → perfiles*, en la fila recién creada: `rol = admin`.

A partir de ahí, `/admin` da de alta a los dueños de box: crea el usuario, lo ata
a su box y enseña una contraseña temporal una sola vez.

---

## 3. Dónde se publica

Al ser ficheros estáticos, sirve cualquier sitio. Dos condiciones y solo dos:

1. **HTTPS.** Sin él la cámara del móvil no está disponible desde el navegador y
   la aplicación no se puede instalar. La mitad del producto deja de funcionar.
2. **Que cualquier dirección se sirva con `index.html`.** El repositorio ya trae
   los dos ficheros que lo consiguen: `public/_redirects` para Netlify y
   `public/.htaccess` para Apache, que es lo que usa Hostinger. Sin eso, entrar
   directamente en `app.ergobox.es/boxes` daría un 404.

| Dónde | Coste | Cómo se publica |
|---|---|---|
| **Hostinger** (el que ya tienes) | 0 € | Subes `dist/` al subdominio |
| Netlify | 0 € | Conectas el repositorio y se publica en cada `git push` |
| Cloudflare Pages | 0 € | Igual que Netlify |

**Recomendación: Hostinger**, ya que era lo que querías y ahora sí puede. No hay
factura nueva, no hay proveedor nuevo y no hay servidor que mantener. Lo único que
pierdes frente a Netlify es el despliegue automático al hacer `git push`: aquí hay
que subir la carpeta a mano o con Git deploy.

### 3.1 En Hostinger

1. hPanel → *Dominios → Subdominios* → crea `app`. Hostinger creará una carpeta,
   normalmente `/public_html/app` o `/domains/app.ergobox.es/public_html`.
2. Sube **el contenido** del `.zip` que acompaña a esta entrega (no la carpeta que
   lo envuelve) a esa ruta, por FTP o desde el administrador de archivos. Ya lleva
   dentro el `config.json` con los datos del proyecto.

   Dos ficheros empiezan por punto o se parecen a basura y **no se pueden dejar
   fuera**:

   | Fichero | Qué pasa si falta |
   |---|---|
   | `.htaccess` | Entrar directo en `/boxes` da un 404. Muchos clientes de FTP lo esconden por empezar por punto |
   | `config.json` | La aplicación arranca y dice "falta configurar" |

3. hPanel → *SSL* → activa el certificado para el subdominio.

Para reconstruirlo desde el repositorio en vez de usar el `.zip`:

```bash
npm ci
npm run build
cp public/config.example.json dist/config.json   # y rellénalo (§2.5)
```

`dist/config.json` está en el `.gitignore` a propósito: es lo único que cambia
entre un despliegue y otro, y no tiene por qué viajar en el repositorio.

Para actualizar: reconstruye y vuelve a subir. El `config.json` que ya está en el
servidor puedes dejarlo tal cual.

### 3.2 En Netlify, si prefieres que se publique solo

1. *Add new site → Import an existing project*, apuntando a este repositorio.
2. Build command `npm run build`, directorio de publicación `dist`.
3. Sube el `config.json` de §2.5 a `public/` antes de conectar el repositorio, o
   deja que Netlify lo genere en el build. Las variables `VITE_` también valen
   aquí, pero entonces cambiar de proyecto obliga a reconstruir.
4. *Domain management → Add a domain*: `app.ergobox.es`.

Cada `git push` publica. Si algo sale mal, *Deploys → Publish deploy* vuelve a la
versión anterior en un clic.

---

## 4. El DNS

hPanel → *Dominios → ergobox.es → DNS / Nameservers*.

Con el subdominio de Hostinger no hay nada que hacer: se crea solo al crear el
subdominio. Con Netlify o Cloudflare, un registro:

| Tipo | Nombre | Apunta a |
|---|---|---|
| `CNAME` | `app` | El destino que te dé el proveedor |

**Nada de esto toca `ergobox.es`.** El registro del dominio raíz se queda como
está y la web sigue publicándose igual.

---

## 5. El enlace desde la web

En el repositorio de la web, en el menú de `index.html`, junto a los enlaces
actuales y antes del botón de reservar:

```html
<a href="https://app.ergobox.es" class="nav-link">Acceso clientes</a>
```

Un enlace normal, sin `target="_blank"`: quien entra a mirar su parque no quiere
una pestaña más, quiere estar dentro.

Ese cambio hay que hacerlo en el otro repositorio, no en este.

---

## 6. Antes de dar la dirección a un cliente

- [ ] La clave de Hostinger, revocada (§0).
- [x] `probar-aislamiento.sql` termina en `TODO EN ORDEN` contra el Supabase real.
- [ ] `https://app.ergobox.es` carga con candado y sin avisos.
- [ ] Has cambiado la contraseña temporal del administrador (§2.7).
- [ ] Entrar directamente en `https://app.ergobox.es/boxes` funciona y no da 404.
      Si lo da, falta el `.htaccess` o el `_redirects`.
- [ ] Entras como administrador y ves los boxes.
- [ ] Das de alta un usuario de prueba atado a un box, entras con él y **solo** ves
      ese box.
- [ ] Ese usuario ve las fotos de su historial.
- [ ] Desde el móvil, "Añadir a pantalla de inicio" instala la aplicación, y una
      vez instalada abre en modo avión.
- [ ] En `/ajustes`, activar los avisos y pulsar "enviarme una de prueba" hace que
      llegue una notificación al móvil. *(Solo después de §2.6; hasta entonces la
      pantalla dirá que no están disponibles, y eso no impide lanzar.)*
