#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Ergobox — dejar la aplicación construida en la rama `publicar`
#
# Hostinger no sabe construir nada: sirve los ficheros que encuentra. Y su
# integración con Git tampoco ejecuta `npm run build`, solo trae lo que hay en la
# rama. Así que la rama `publicar` no lleva código fuente: lleva EXACTAMENTE lo
# que tiene que haber dentro de la carpeta del subdominio.
#
# Con eso, redesplegar es un botón en el hPanel: Hostinger trae la rama y ya
# está. Ni FTP, ni .zip, ni arrastrar carpetas.
#
# Lo lanza quien tenga el repositorio delante, normalmente yo después de tocar
# algo. Tú no necesitas ejecutarlo: solo pulsar el botón.
#
#   bash scripts/publicar.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

RAMA_PUBLICACION="publicar"
ORIGEN="$(git rev-parse --abbrev-ref HEAD)"
CABEZA="$(git rev-parse --short HEAD)"

echo "── Construyendo desde $ORIGEN ($CABEZA)"
npm run build

# La configuración del servidor viaja con la aplicación. La clave anónima es
# pública por diseño —va dentro de cada navegador que abre la app— y no concede
# nada por sí sola: quien decide qué datos salen son las políticas de la base de
# datos. Por eso puede estar en el repositorio sin que sea un problema.
cp despliegue/config.produccion.json dist/config.json

# La plantilla de ejemplo no pinta nada en un servidor de verdad.
rm -f dist/config.example.json

echo "── Empaquetando la rama $RAMA_PUBLICACION"

# Se construye en una carpeta aparte, fuera del repositorio, para no tocar el
# árbol de trabajo ni la rama en la que estás. Un `git checkout` a mitad de
# camino sería la manera fácil de perder algo sin querer.
TEMPORAL="$(mktemp -d)"
trap 'rm -rf "$TEMPORAL"' EXIT

cp -R dist/. "$TEMPORAL"/
# Los ficheros que empiezan por punto no los coge `dist/.` en algunos sistemas.
cp dist/.htaccess "$TEMPORAL"/ 2>/dev/null || true

cd "$TEMPORAL"
git init -q
git checkout -q -b "$RAMA_PUBLICACION"
git add -A
git -c user.name="Ergobox" -c user.email="hola@ergobox.es" \
  commit -q -m "Publicar $CABEZA desde $ORIGEN"

# Historia de una sola entrega: a nadie le interesa el histórico de una carpeta
# de ficheros construidos, y así la rama no engorda con cada publicación.
git push -q --force "$(cd "$RAIZ" && git remote get-url origin)" "$RAMA_PUBLICACION"

echo "── Listo. La rama '$RAMA_PUBLICACION' ya tiene $CABEZA."
echo "   Ahora, en el hPanel de Hostinger: Git → Desplegar."
