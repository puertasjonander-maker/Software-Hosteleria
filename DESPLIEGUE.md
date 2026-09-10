# DESPLIEGUE.md — Ergobox en `app.ergobox.es`

Cómo pasar de este repositorio a algo que Antonio pueda abrir desde el móvil, sin
tocar la web de ergobox.es que ya está publicada.

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

### 2.3 Comprobar que el aislamiento funciona

Contra el propio Supabase, con la cadena de conexión de *Project Settings →
Database*:

```bash
psql "<cadena-de-conexion>" -v ON_ERROR_STOP=1 -f scripts/probar-aislamiento.sql
```

Tiene que terminar en `TODO EN ORDEN`. **Si falla, no des acceso a ningún cliente
hasta arreglarlo**: en esta arquitectura las políticas no son una capa más, son la
única.

### 2.4 Desplegar la función de alta de usuarios

Es la única pieza del producto que corre fuera del navegador. Existe porque crear
un usuario o cambiarle la contraseña exige la clave de servicio, y esa clave no
puede bajar al móvil de nadie.

```bash
supabase functions deploy alta-usuario
supabase secrets set ORIGEN_PERMITIDO=https://app.ergobox.es
```

La clave de servicio ya está disponible dentro de la función sin configurarla:
Supabase la inyecta. `ORIGEN_PERMITIDO` no es imprescindible, pero sin él la
función acepta peticiones desde cualquier página.

### 2.5 Variables de la aplicación

De *Project Settings → API*:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

Las dos viajan al navegador; el prefijo `VITE_` lo dice. La anónima es pública por
diseño y no concede nada por sí sola.

**Si alguna vez ves una variable `VITE_` con la palabra `service` o `secret` en el
nombre, es un incidente de seguridad y no una configuración.**

### 2.6 El primer administrador

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
2. En tu máquina:

   ```bash
   npm ci
   cp .env.example .env.local     # con las dos variables de §2.5
   npm run build
   ```

3. Sube **el contenido de `dist/`** (no la carpeta) a esa ruta, por FTP o desde el
   administrador de archivos. Asegúrate de que sube también el `.htaccess`, que al
   empezar por punto muchos clientes de FTP esconden.
4. hPanel → *SSL* → activa el certificado para el subdominio.

Para actualizar: `npm run build` y vuelve a subir `dist/`.

### 3.2 En Netlify, si prefieres que se publique solo

1. *Add new site → Import an existing project*, apuntando a este repositorio.
2. Build command `npm run build`, directorio de publicación `dist`.
3. *Site configuration → Environment variables*: las dos de §2.5.
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
- [ ] `probar-aislamiento.sql` termina en `TODO EN ORDEN` contra el Supabase real.
- [ ] `https://app.ergobox.es` carga con candado y sin avisos.
- [ ] Entrar directamente en `https://app.ergobox.es/boxes` funciona y no da 404.
      Si lo da, falta el `.htaccess` o el `_redirects`.
- [ ] Entras como administrador y ves los boxes.
- [ ] Das de alta un usuario de prueba atado a un box, entras con él y **solo** ves
      ese box.
- [ ] Ese usuario ve las fotos de su historial.
- [ ] Desde el móvil, "Añadir a pantalla de inicio" instala la aplicación, y una
      vez instalada abre en modo avión.
