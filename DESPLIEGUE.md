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

Tres piezas, cada una en su sitio:

| Dirección | Qué es | Dónde vive |
|---|---|---|
| `ergobox.es` | La web actual, la que capta clientes | Hostinger, sin tocar |
| `app.ergobox.es` | Esta aplicación | Netlify, gratis (ver §3) |
| — | Base de datos, usuarios y fotos | Supabase |

**Por qué un subdominio y no `ergobox.es/app`.** Con una carpeta habría que mover
el dominio entero a donde corra la aplicación y volver a servir la web desde ahí:
se toca algo que ya funciona y está indexado, para no ganar nada. Un subdominio es
un registro de DNS y un enlace en el menú, y se deshace borrando el registro.

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

> **No ejecutes `prisma migrate dev`.** Prisma no sabe de políticas ni de
> triggers: las borraría y el aislamiento entre boxes se caería sin avisar.

### 2.3 Comprobar que el aislamiento funciona

Contra el propio Supabase, con la cadena de conexión de *Project Settings →
Database*:

```bash
psql "<cadena-de-conexion>" -v ON_ERROR_STOP=1 -f scripts/probar-aislamiento.sql
```

Tiene que terminar en `TODO EN ORDEN`. Si falla, no des acceso a ningún cliente
hasta arreglarlo.

### 2.4 Variables de entorno

De *Project Settings → API*:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

`SUPABASE_SERVICE_ROLE_KEY` se salta la RLS entera. **Nunca** con prefijo
`NEXT_PUBLIC_`, nunca en el repositorio, nunca en el navegador. La usan dos sitios:
el alta de usuarios en `/admin` y el cron de avisos de la fase 5.

### 2.5 El primer administrador

El resto de altas se hacen desde `/admin`, pero esa pantalla exige ser
administrador, así que el primero se pone a mano una vez:

1. *Authentication → Users → Add user*, con contraseña y confirmando el correo.
2. *Table editor → perfiles*, en la fila recién creada: `rol = admin`.

A partir de ahí, `/admin` da de alta a los dueños de box: crea el usuario, lo ata
a su box y enseña una contraseña temporal una sola vez.

---

## 3. Dónde corre la aplicación

**En el hosting compartido de Hostinger no puede correr, y no es cuestión de
configurarlo mejor.** Ese plan sirve ficheros y ejecuta PHP. Esta aplicación es un
programa de Node que tiene que estar encendido todo el rato: comprueba la sesión
en cada petición, firma los enlaces de las fotos y ejecuta las acciones de
servidor. Sin un proceso vivo no hay nada que servir.

Las opciones reales:

| Dónde | Coste | Mantenimiento | Cambios en el código | Nota |
|---|---|---|---|---|
| **Netlify** | Gratis | Ninguno | Ninguno | Su plan gratuito **sí** permite uso comercial. Lo único que prohíbe es revender el hosting |
| VPS de Hostinger | ~5 €/mes | Tuyo | Ninguno | Un solo proveedor y una sola factura |
| Vercel | Gratis solo si no es un negocio | Ninguno | Ninguno | Ver abajo |
| Cloudflare Pages | Gratis | Poco | Adaptador y probarlo entero | Su runtime no es Node del todo |
| Convertirlo en app estática | Gratis, cabe en Hostinger | Ninguno | **Reescritura de un par de días** | Ver §3.1 |

**Recomendación: Netlify.** Es lo mismo que Vercel en comodidad, no cuesta nada,
no exige tocar una línea y su plan gratuito permite explícitamente proyectos
comerciales. El VPS solo compensa si prefieres una única factura y no te importa
cuidar el servidor.

### 3.1 Sobre Vercel gratis, y sobre por qué otras aplicaciones no lo necesitaron

**Vercel gratis funcionaría técnicamente, pero su plan Hobby es solo para uso no
comercial.** Cualquier proyecto que forme parte de un negocio necesita el plan Pro,
unos 20 $ al mes. No es una zona gris de las condiciones: está escrito y lo
aplican. Netlify no tiene esa cláusula, y por eso es la recomendación.

**Y otras aplicaciones no necesitaron nada de esto porque eran estáticas.** Una
página que se descarga entera al navegador y habla directamente con Supabase se
puede colgar en cualquier hosting, y sigue siendo segura: la RLS decide igual de
bien viniendo del navegador que del servidor. Esta aplicación se escribió del otro
modo, con las pantallas renderizadas en servidor.

Se puede convertir. Lo que costaría:

- Cada pantalla pasa a pedir sus datos desde el navegador, con sus estados de
  carga. Son las siete pantallas.
- Las acciones de servidor desaparecen; en su lugar, llamadas directas a Supabase.
- Las rutas con id (`/clientes/[id]`) no existen en una exportación estática: hay
  que pasarlas a `?id=...` o cambiar de router.
- El alta de usuarios de `/admin` **no puede** irse al navegador, porque usa la
  service role key. Tendría que vivir en una Edge Function de Supabase, que es
  gratis. Lo mismo el cron de avisos de la fase 5.
- La ruta de suscripción a las notificaciones también se va a una Edge Function.

Es un par de días de trabajo para ahorrar cero euros frente a Netlify. Tiene
sentido si algún día quieres no depender de nadie más que de Hostinger y Supabase;
no lo tiene para salir cuanto antes.

### 3.2 Netlify, que es la vía recomendada

Sin receta de servidor, porque no hay servidor que montar:

1. Entra en [netlify.com](https://netlify.com) con la cuenta de GitHub y elige
   *Add new site → Import an existing project* apuntando a este repositorio.
2. Netlify detecta Next.js solo. Deja `npm run build` como comando de build y no
   toques el directorio de publicación.
3. En *Site configuration → Environment variables*, las tres claves de §2.4.
   `SUPABASE_SERVICE_ROLE_KEY` va aquí y en ningún otro sitio.
4. En *Domain management → Add a domain*, escribe `app.ergobox.es`. Netlify te dará
   un destino para el `CNAME` del §4 y pondrá el certificado él solo.

Cada `git push` a la rama publica una versión nueva. Si algo sale mal, *Deploys →
Publish deploy* vuelve a la anterior en un clic.

El plan gratuito da 100 GB de tráfico y 125.000 invocaciones de función al mes.
Para un puñado de boxes y sus dueños no se roza: las fotos no cuentan ahí, porque
se sirven desde Supabase.

### 3.3 Receta del VPS (Ubuntu 22.04 o 24.04), si prefieres esa vía

```bash
# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx

# La aplicación
sudo mkdir -p /var/www/ergobox && sudo chown $USER /var/www/ergobox
git clone <url-de-este-repo> /var/www/ergobox
cd /var/www/ergobox
npm ci
cp .env.example .env.local     # y rellena los tres valores de §2.4
npm run build
```

Un servicio de systemd para que arranque solo y se levante si se cae —
`/etc/systemd/system/ergobox.service`:

```ini
[Unit]
Description=Ergobox
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/ergobox
EnvironmentFile=/var/www/ergobox/.env.local
ExecStart=/usr/bin/npm run start
Restart=always
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now ergobox
```

Nginx por delante, en `/etc/nginx/sites-available/app.ergobox.es`:

```nginx
server {
  server_name app.ergobox.es;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  # El tope por defecto de nginx es 1 MB y las fotos suben en tandas. Van
  # recomprimidas a unos 200 kB, así que 8 MB sobra y corta cualquier abuso.
  client_max_body_size 8m;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/app.ergobox.es /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d app.ergobox.es
```

**El certificado no es opcional.** Sin HTTPS, la cámara del móvil no está
disponible desde el navegador y la aplicación no se puede instalar como PWA: la
mitad del producto deja de funcionar.

### 3.4 Actualizar el VPS

```bash
cd /var/www/ergobox && git pull && npm ci && npm run build && sudo systemctl restart ergobox
```

---

## 4. El DNS en Hostinger

hPanel → *Dominios → ergobox.es → DNS / Nameservers*, y un registro nuevo:

| Tipo | Nombre | Apunta a |
|---|---|---|
| `A` | `app` | La IP del VPS |

Con Netlify —o Cloudflare— en vez de un VPS, el registro es un `CNAME` con nombre
`app` apuntando al destino que ellos den, en lugar del `A` de la tabla. Tarda entre minutos y un par de horas en propagarse.

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
- [ ] Entras como administrador y ves los boxes.
- [ ] Das de alta un usuario de prueba atado a un box, entras con él y **solo** ves
      ese box.
- [ ] Ese usuario ve las fotos de su historial y el enlace de una foto caduca al
      cabo de una hora.
- [ ] Desde el móvil, "Añadir a pantalla de inicio" instala la aplicación.
