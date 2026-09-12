// ─────────────────────────────────────────────────────────────────────────────
// Ergobox — el correo que da acceso
//
// Es lo primero que ve un cliente de Ergobox, y llega antes de que entre en la
// aplicación. Así que se cuida, pero se cuida dentro de las reglas del correo,
// que no son las de una página web:
//
//   · Tablas para maquetar. Ni flex ni grid: Outlook usa el motor de Word y los
//     ignora, y lo que en Gmail queda en dos columnas allí se apila roto.
//   · Estilos en línea. Muchos clientes tiran la etiqueta <style> entera.
//   · Nada de imágenes para lo importante. Media bandeja las bloquea por defecto,
//     y una contraseña dentro de un PNG no se puede ni copiar ni leer.
//   · Colores explícitos en cada celda. Sin eso, el modo oscuro de Gmail invierte
//     lo que le parece y deja texto gris sobre gris.
//
// Y una versión en texto plano, que no es un detalle: sin ella los filtros de
// spam puntúan peor el mensaje, y el que más nos importa es justo el primero que
// mandamos a una dirección nueva.
// ─────────────────────────────────────────────────────────────────────────────

export type DatosAcceso = {
  nombre: string
  email: string
  contrasena: string
  /** El box del que es dueño, o null si es alguien del equipo de Ergobox. */
  box: string | null
  url: string
}

const TINTA = '#1a1614'
const SUAVE = '#6b625a'
const CREMA = '#faf7f2'
const LINEA = '#e6ded2'

/** Para que `<` o `&` en un nombre no rompan el HTML ni metan etiquetas. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function asuntoAcceso(datos: DatosAcceso): string {
  return datos.box
    ? `Tu acceso al mantenimiento de ${datos.box}`
    : 'Tu acceso a Ergobox'
}

export function textoAcceso(d: DatosAcceso): string {
  const saludo = d.nombre ? `Hola ${d.nombre},` : 'Hola,'
  const que = d.box
    ? `Ya puedes consultar el estado de las máquinas de ${d.box}: en qué estado está cada una, qué se le ha hecho y cuándo le toca la próxima revisión.`
    : 'Ya tienes acceso a Ergobox para el trabajo de campo: visitas, partes y fotos.'

  return [
    saludo,
    '',
    que,
    '',
    `Entra en: ${d.url}`,
    `Usuario: ${d.email}`,
    `Contraseña: ${d.contrasena}`,
    '',
    'Esta contraseña es temporal. Cámbiala cuando entres.',
    '',
    'Cualquier cosa, responde a este correo.',
    'Ergobox · hola@ergobox.es',
  ].join('\n')
}

export function htmlAcceso(d: DatosAcceso): string {
  const nombre = escapar(d.nombre)
  const email = escapar(d.email)
  const contrasena = escapar(d.contrasena)
  const box = d.box ? escapar(d.box) : null
  const saludo = nombre ? `Hola ${nombre},` : 'Hola,'

  const que = box
    ? `Ya puedes ver el estado del parque de <strong>${box}</strong>: cómo está cada máquina, qué se le ha hecho y cuándo le toca la próxima revisión.`
    : 'Ya tienes acceso a Ergobox para el trabajo de campo: visitas, partes y fotos de antes y después.'

  // La línea de preencabezado es lo que se lee en la lista de la bandeja, al lado
  // del asunto. Sin ella, el cliente de correo coge la primera frase del cuerpo,
  // que aquí sería "Hola," y no dice nada.
  const preencabezado = box
    ? `Tus claves para consultar el mantenimiento de ${box}.`
    : 'Tus claves para entrar en Ergobox.'

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(asuntoAcceso(d))}</title>
</head>
<body style="margin:0; padding:0; background-color:${CREMA}; color:${TINTA};">

<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapar(preencabezado)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background-color:${CREMA}; padding:24px 12px;">
  <tr>
    <td align="center">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:520px; background-color:#ffffff; border:1px solid ${LINEA}; border-radius:10px;">

        <tr>
          <td style="padding:28px 28px 0 28px;">
            <p style="margin:0; font-family:Helvetica,Arial,sans-serif; font-size:12px;
                      font-weight:bold; letter-spacing:1.5px; text-transform:uppercase;
                      color:${SUAVE};">Ergobox</p>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 28px 0 28px;">
            <h1 style="margin:0; font-family:Helvetica,Arial,sans-serif; font-size:23px;
                       line-height:1.25; font-weight:bold; color:${TINTA};">${escapar(
                         box ? 'Ya puedes ver tus máquinas' : 'Ya tienes acceso',
                       )}</h1>
          </td>
        </tr>

        <tr>
          <td style="padding:14px 28px 0 28px; font-family:Georgia,'Times New Roman',serif;
                     font-size:16px; line-height:1.6; color:${TINTA};">
            <p style="margin:0 0 12px 0;">${escapar(saludo)}</p>
            <p style="margin:0;">${que}</p>
          </td>
        </tr>

        <tr>
          <td style="padding:22px 28px 0 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background-color:${CREMA}; border:1px solid ${LINEA}; border-radius:8px;">
              <tr>
                <td style="padding:16px 18px;">
                  <p style="margin:0 0 4px 0; font-family:Helvetica,Arial,sans-serif; font-size:11px;
                            font-weight:bold; letter-spacing:1px; text-transform:uppercase;
                            color:${SUAVE};">Usuario</p>
                  <p style="margin:0 0 14px 0; font-family:'Courier New',Courier,monospace;
                            font-size:15px; color:${TINTA}; word-break:break-all;">${email}</p>

                  <p style="margin:0 0 4px 0; font-family:Helvetica,Arial,sans-serif; font-size:11px;
                            font-weight:bold; letter-spacing:1px; text-transform:uppercase;
                            color:${SUAVE};">Contraseña temporal</p>
                  <p style="margin:0; font-family:'Courier New',Courier,monospace; font-size:19px;
                            font-weight:bold; letter-spacing:1px; color:${TINTA};">${contrasena}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:22px 28px 0 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="background-color:${TINTA}; border-radius:8px;">
                  <a href="${escapar(d.url)}"
                     style="display:inline-block; padding:13px 26px; font-family:Helvetica,Arial,sans-serif;
                            font-size:15px; font-weight:bold; color:#ffffff; text-decoration:none;">
                    Entrar en Ergobox
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:18px 28px 0 28px; font-family:Georgia,'Times New Roman',serif;
                     font-size:14px; line-height:1.6; color:${SUAVE};">
            <p style="margin:0;">
              La contraseña es temporal. Cámbiala cuando entres, y si no te funciona el
              botón, copia esta dirección en el navegador:
              <br>
              <span style="font-family:'Courier New',Courier,monospace; font-size:13px;
                           color:${TINTA}; word-break:break-all;">${escapar(d.url)}</span>
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:22px 28px 28px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-top:1px solid ${LINEA}; padding-top:16px;
                           font-family:Helvetica,Arial,sans-serif; font-size:13px;
                           line-height:1.6; color:${SUAVE};">
                  Cualquier cosa, responde a este correo.<br>
                  <a href="mailto:hola@ergobox.es" style="color:${SUAVE};">hola@ergobox.es</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>

      <p style="margin:16px 0 0 0; font-family:Helvetica,Arial,sans-serif; font-size:11px;
                color:${SUAVE};">
        Ergobox · Mantenimiento de máquinas de gimnasio · Málaga
      </p>

    </td>
  </tr>
</table>

</body>
</html>`
}
