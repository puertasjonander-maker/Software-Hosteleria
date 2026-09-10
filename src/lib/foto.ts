/**
 * Recompresión de fotos antes de guardarlas (EBX-204).
 *
 * Esto no es una optimización: es lo que hace viable trabajar sin cobertura.
 *
 * Una visita como la de un box de doce máquinas son doce fichas por dos
 * momentos, antes y después. A tres fotos por momento son unas setenta imágenes.
 * Sin tocar nada, un móvil actual las guarda a cuatro o cinco megas cada una:
 * cerca de 300 MB en el almacenamiento del navegador, que es exactamente donde
 * el sistema operativo decide desalojarte la pestaña y llevarse la cola por
 * delante. A 1600 px bajan a unos 200 kB y la visita entera cabe en quince megas.
 *
 * El original no se guarda. Para documentar óxido en un brazo o suciedad en un
 * volante no aporta nada, y guardarlo cuesta la cola entera.
 */

export const LADO_LARGO_PX = 1600
export const CALIDAD_JPEG = 0.72

export type FotoComprimida = {
  blob: Blob
  bytes: number
  ancho: number
  alto: number
}

/**
 * Decodifica respetando la orientación EXIF.
 *
 * `createImageBitmap` con `imageOrientation: 'from-image'` es lo que evita que
 * una foto hecha en vertical acabe tumbada: el sensor la guarda apaisada y deja
 * la rotación en los metadatos, que un canvas ignora. Sin esto, medio informe
 * saldría de lado.
 */
async function decodificar(fichero: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(fichero, { imageOrientation: 'from-image' })
    } catch {
      // Safari antiguo no admite la opción. Se cae al camino de <img>, que sí
      // aplica la orientación al pintar.
    }
  }

  const url = URL.createObjectURL(fichero)
  try {
    return await new Promise<HTMLImageElement>((resolver, rechazar) => {
      const img = new Image()
      img.onload = () => resolver(img)
      img.onerror = () => rechazar(new Error('No se ha podido leer la imagen'))
      img.src = url
    })
  } finally {
    // Se revoca en cuanto la imagen está decodificada: dejarlo vivo por foto
    // filtra memoria durante toda la visita.
    URL.revokeObjectURL(url)
  }
}

export async function comprimirFoto(fichero: File | Blob): Promise<FotoComprimida> {
  const fuente = await decodificar(fichero)
  const anchoOriginal = 'width' in fuente ? fuente.width : 0
  const altoOriginal = 'height' in fuente ? fuente.height : 0

  if (!anchoOriginal || !altoOriginal) throw new Error('Imagen sin dimensiones')

  const escala = Math.min(1, LADO_LARGO_PX / Math.max(anchoOriginal, altoOriginal))
  const ancho = Math.round(anchoOriginal * escala)
  const alto = Math.round(altoOriginal * escala)

  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto

  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('Sin canvas 2d')
  ctx.drawImage(fuente as CanvasImageSource, 0, 0, ancho, alto)

  if ('close' in fuente && typeof fuente.close === 'function') fuente.close()

  const blob = await new Promise<Blob | null>((resolver) =>
    lienzo.toBlob(resolver, 'image/jpeg', CALIDAD_JPEG),
  )
  if (!blob) throw new Error('No se ha podido comprimir la foto')

  return { blob, bytes: blob.size, ancho, alto }
}

/** "1,2 MB" / "184 kB". Para que el técnico vea cuánto le queda por subir. */
export function tamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / (1024 * 1024)).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`
}
