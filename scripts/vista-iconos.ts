/**
 * Hoja de revisión de los iconos de máquina.
 *
 * Genera una imagen con los nueve iconos al tamaño grande (para mirar la forma) y al
 * tamaño real de la aplicación (para comprobar que se entienden de un vistazo, que
 * es lo único que importa: a 20 px no hay detalle que valga, hay silueta o no hay
 * nada).
 *
 *   npx tsx scripts/vista-iconos.ts
 *
 * Escribe el PNG en /home/hermes/iconos-maquina.png.
 */
import { chromium } from 'playwright'
import { ICONOS_MAQUINA } from '../src/lib/iconos-maquina'
import { ETIQUETA_TIPO_MAQUINA } from '../src/lib/roles'
import type { TipoMaquina } from '../src/lib/database.types'

const TIPOS = [
  'rowerg',
  'skierg',
  'bikeerg',
  'air_bike',
  'cinta',
  'barra',
  'disco',
  'rack',
  'otro',
] as TipoMaquina[]

/** El mismo trazo que usa la aplicación: rejilla de 24 y trazo fino de 1.7. */
function svg(tipo: TipoMaquina, lado: number, grosor = 1.7): string {
  const cuerpo = ICONOS_MAQUINA[tipo]
    .map((f) =>
      f.t === 'circle'
        ? `<circle cx="${f.cx}" cy="${f.cy}" r="${f.r}" />`
        : `<path d="${f.d}" />`,
    )
    .join('')
  return `<svg viewBox="0 0 24 24" width="${lado}" height="${lado}" fill="none"
    stroke="currentColor" stroke-width="${grosor}" stroke-linecap="round"
    stroke-linejoin="round">${cuerpo}</svg>`
}

const filas = TIPOS.map(
  (tipo) => `
  <div class="fila">
    <div class="grande">${svg(tipo, 128, 1.5)}</div>
    <div class="datos">
      <p class="nombre">${ETIQUETA_TIPO_MAQUINA[tipo]}</p>
      <p class="clave">${tipo}</p>
    </div>
    <div class="tamanos">
      <span class="muestra">${svg(tipo, 40)}<em>40</em></span>
      <span class="muestra">${svg(tipo, 20)}<em>20</em></span>
      <span class="muestra">${svg(tipo, 16)}<em>16</em></span>
    </div>
  </div>`,
).join('')

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><style>
  :root { color-scheme: dark; }
  body {
    margin: 0; padding: 28px 32px 36px; background: #14120f; color: #f5f1ea;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  h1 { font-size: 21px; margin: 0 0 4px; letter-spacing: -0.02em; }
  .sub { margin: 0 0 24px; font-size: 13px; color: #a49c8f; }
  .fila {
    display: grid; grid-template-columns: 150px 190px 1fr; align-items: center;
    gap: 20px; padding: 14px 18px; border-radius: 14px; background: #1d1a16;
    border: 1px solid #2b2721; margin-bottom: 10px;
  }
  .grande { display: flex; justify-content: center; color: #f0a24b; }
  .nombre { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
  .clave { margin: 2px 0 0; font-size: 12px; color: #8d8578;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .tamanos { display: flex; gap: 34px; justify-content: flex-end; color: #f5f1ea; }
  .muestra { display: flex; flex-direction: column; align-items: center; gap: 5px; }
  .muestra em { font-size: 10px; font-style: normal; color: #6f6a60; }
</style></head><body>
  <h1>Iconos de máquina — Ergobox</h1>
  <p class="sub">Los nueve tipos del sistema. Arriba a tamaño grande, a la derecha a tamaño real de la aplicación (el de 20 px es el que se ve en las listas).</p>
  ${filas}
</body></html>`

const { writeFile } = await import('node:fs/promises')
await writeFile('/tmp/iconos-maquina.html', html)

const navegador = await chromium.launch()
const pagina = await navegador.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 2 })
await pagina.goto('file:///tmp/iconos-maquina.html')
await pagina.screenshot({ path: '/home/hermes/iconos-maquina.png', fullPage: true })
await navegador.close()

console.log('escrito /home/hermes/iconos-maquina.png')