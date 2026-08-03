/**
 * Genera los PNG del icono de la PWA a partir de la misma geometría que
 * `public/icons/icon.svg`.
 *
 * Se rasteriza a mano con zlib en vez de tirar de sharp o de un binario de
 * ImageMagick: el icono son cuatro formas, y así no se añade una dependencia
 * nativa a un proyecto que solo la usaría una vez.
 *
 *   node scripts/generar-iconos.mjs
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const DESTINO = join(RAIZ, 'public', 'icons')

const FONDO = [37, 28, 22, 255] // espresso, el mismo --primary del tema
const MARCA = [232, 216, 195, 255] // crema
const TRANSPARENTE = [0, 0, 0, 0]

/** Distancia con signo a un rectángulo redondeado, para antialias del borde. */
function distanciaRectRedondeado(px, py, cx, cy, mediaAnchura, mediaAltura, radio) {
  const dx = Math.abs(px - cx) - (mediaAnchura - radio)
  const dy = Math.abs(py - cy) - (mediaAltura - radio)
  const fuera = Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
  return fuera + Math.min(Math.max(dx, dy), 0) - radio
}

/** Distancia de un punto al segmento a→b: sirve para los trazos de la "M". */
function distanciaSegmento(px, py, ax, ay, bx, by) {
  const abx = bx - ax
  const aby = by - ay
  const largo = abx * abx + aby * aby
  const t = largo === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / largo))
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t))
}

function mezclar(base, encima, alfa) {
  if (alfa <= 0) return base
  if (alfa >= 1 && encima[3] === 255) return encima
  const a = alfa * (encima[3] / 255)
  const aFinal = a + (base[3] / 255) * (1 - a)
  if (aFinal === 0) return TRANSPARENTE
  const canal = (i) =>
    Math.round((encima[i] * a + base[i] * (base[3] / 255) * (1 - a)) / aFinal)
  return [canal(0), canal(1), canal(2), Math.round(aFinal * 255)]
}

/** Cobertura suavizada: 1 dentro, 0 fuera, degradado en el píxel del borde. */
function cobertura(distancia, suavizado) {
  return Math.max(0, Math.min(1, 0.5 - distancia / suavizado))
}

function dibujar(tam, { maskable }) {
  const px = new Uint8Array(tam * tam * 4)
  const suavizado = Math.max(1.2, tam / 128)

  // En un icono maskable el sistema puede recortar hasta un 20% por cada lado,
  // así que la marca se encoge para caber en la zona segura.
  const escalaMarca = maskable ? 0.62 : 0.82
  const radio = maskable ? tam / 2 : tam * 0.22
  const centro = tam / 2

  const mediaMarca = (tam * escalaMarca) / 2
  const grosor = tam * (maskable ? 0.075 : 0.095)
  const x0 = centro - mediaMarca * 0.62
  const x1 = centro + mediaMarca * 0.62
  const yArriba = centro - mediaMarca * 0.5
  const yAbajo = centro + mediaMarca * 0.5
  const xMedio = centro
  const yValle = centro + mediaMarca * 0.16

  const trazos = [
    [x0, yAbajo, x0, yArriba], // pata izquierda
    [x0, yArriba, xMedio, yValle], // diagonal de bajada
    [xMedio, yValle, x1, yArriba], // diagonal de subida
    [x1, yArriba, x1, yAbajo], // pata derecha
  ]

  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      const cx = x + 0.5
      const cy = y + 0.5

      let color = TRANSPARENTE

      const dFondo = maskable
        ? Math.hypot(cx - centro, cy - centro) - tam / 2
        : distanciaRectRedondeado(cx, cy, centro, centro, tam / 2, tam / 2, radio)
      color = mezclar(color, FONDO, cobertura(dFondo, suavizado))

      let dMarca = Infinity
      for (const [ax, ay, bx, by] of trazos) {
        dMarca = Math.min(dMarca, distanciaSegmento(cx, cy, ax, ay, bx, by) - grosor / 2)
      }
      color = mezclar(color, MARCA, cobertura(dMarca, suavizado))

      const i = (y * tam + x) * 4
      px[i] = color[0]
      px[i + 1] = color[1]
      px[i + 2] = color[2]
      px[i + 3] = color[3]
    }
  }

  return px
}

function crc32(buf) {
  let c
  const tabla = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabla[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const byte of buf) crc = tabla[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(tipo, datos) {
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(datos.length)
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(cuerpo))
  return Buffer.concat([largo, cuerpo, crc])
}

function aPng(px, tam) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(tam, 0)
  ihdr.writeUInt32BE(tam, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // Una fila = 1 byte de filtro (0 = sin filtro) + los píxeles.
  const crudo = Buffer.alloc(tam * (tam * 4 + 1))
  for (let y = 0; y < tam; y++) {
    crudo[y * (tam * 4 + 1)] = 0
    Buffer.from(px.buffer, y * tam * 4, tam * 4).copy(crudo, y * (tam * 4 + 1) + 1)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(crudo, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(DESTINO, { recursive: true })

const salidas = [
  ['icon-180.png', 180, false],
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
]

for (const [nombre, tam, maskable] of salidas) {
  writeFileSync(join(DESTINO, nombre), aPng(dibujar(tam, { maskable }), tam))
  console.log(`✓ ${nombre} (${tam}×${tam})`)
}
