#!/usr/bin/env python3
"""
Subir el build de Ergobox a app.ergobox.es por la API de Hostinger.

El subdominio es un sitio estático que sirve lo que hay en public_html/app. La API
no sabe construir nada, así que se sube tal cual lo que hay en dist/ (16 ficheros)
por TUS, con override para pisar los que ya estaban, y después se purga la CDN.

No hay endpoint de borrado: los assets de builds anteriores (con hash en el
nombre) se quedan como cruft. Es inofensivo y no se persiguen.
"""
import json
import os
import sys
import time
import urllib.request

TOKEN = os.environ["HOSTINGER_TOKEN"]
USUARIO = "u325144479"
DOMINIO = "app.ergobox.es"
RAIZ = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist")
API = "https://developers.hostinger.com"

# Cloudflare devuelve 403/1010 a clientes sin User-Agent de navegador.
CABECERAS = {
    "Authorization": f"Bearer {TOKEN}",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    "Accept": "application/json",
}


def peticion(metodo, url, cuerpo=None, extras=None, esperado=(200, 201, 204)):
    cabeceras = dict(CABECERAS)
    if extras:
        cabeceras.update(extras)
    datos = cuerpo
    if isinstance(cuerpo, dict):
        datos = json.dumps(cuerpo).encode()
        cabeceras["Content-Type"] = "application/json"
    p = urllib.request.Request(url, data=datos, headers=cabeceras, method=metodo)
    try:
        with urllib.request.urlopen(p, timeout=90) as r:
            contenido = r.read()
            if r.status not in esperado:
                raise RuntimeError(f"{metodo} {url} -> {r.status}")
            return r.status, contenido
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def ficheros_a_subir():
    salida = []
    for carpeta, _, nombres in os.walk(RAIZ):
        for nombre in nombres:
            ruta = os.path.join(carpeta, nombre)
            relativa = os.path.relpath(ruta, RAIZ).replace(os.sep, "/")
            salida.append((relativa, ruta))
    return sorted(salida)


def main():
    ficheros = ficheros_a_subir()
    print(f"── {len(ficheros)} ficheros a subir")
    for rel, _ in ficheros:
        print("   ·", rel)

    estado, cuerpo = peticion("POST", f"{API}/api/hosting/v1/files/upload-urls",
                              {"username": USUARIO, "domain": DOMINIO})
    if estado != 200:
        print("FALLO pidiendo las URLs de subida:", estado, cuerpo[:300])
        return 1
    datos = json.loads(cuerpo)
    base, auth, rest = datos["url"], datos["auth_key"], datos["rest_auth_key"]

    subidos = 0
    for rel, ruta in ficheros:
        with open(ruta, "rb") as f:
            contenido = f.read()
        destino = f"{base}/{rel}?override=true"
        comunes = {
            "X-Auth": auth,
            "X-Auth-Rest": rest,
            "Tus-Resumable": "1.0.0",
        }
        estado, _ = peticion(
            "POST", destino, b"",
            {**comunes, "Upload-Length": str(len(contenido)), "Upload-Offset": "0"},
            esperado=(200, 201, 204),
        )
        if estado not in (200, 201, 204):
            print(f"FALLO creando la subida de {rel}: {estado}")
            return 1

        estado, cuerpo_error = peticion(
            "PATCH", destino, contenido,
            {**comunes, "Content-Type": "application/offset+octet-stream", "Upload-Offset": "0"},
            esperado=(204, 200),
        )
        if estado not in (200, 204):
            print(f"FALLO subiendo {rel}: {estado} {cuerpo_error[:200]}")
            return 1
        subidos += 1
        print("   subido", rel)

    print(f"── {subidos}/{len(ficheros)} subidos")

    estado, _ = peticion(
        "DELETE",
        f"{API}/api/hosting/v1/accounts/{USUARIO}/websites/{DOMINIO}/cache/clear",
    )
    print("── purga de la CDN:", estado)
    return 0


if __name__ == "__main__":
    sys.exit(main())
