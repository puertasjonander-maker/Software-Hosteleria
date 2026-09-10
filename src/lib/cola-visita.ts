import type { Semaforo } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

/**
 * Cola de trabajo de campo (EBX-205).
 *
 * Dentro de una nave con estructura metálica no hay red. La app tiene que dejar
 * registrar igual y subirlo después, y no puede perder una foto por el camino:
 * el texto se puede volver a escribir, una foto de cómo estaba la máquina antes
 * de tocarla no se puede volver a hacer.
 *
 * IndexedDB y no localStorage: localStorage guarda texto, y aquí hay blobs.
 *
 * Cola propia y no Background Sync API: Safari en iOS no la implementa, y el
 * trabajo se hace con el móvil que cada uno lleva encima. Una cola que se vacía
 * al recuperar red y al volver a la pestaña funciona en los dos sitios.
 *
 * La escritura es SIEMPRE local primero, haya red o no. Un solo camino: guardar
 * en IndexedDB y disparar la sincronización. Con dos caminos, el de sin cobertura
 * sería el que nunca se prueba, y es el que de verdad importa.
 */

const BD = 'ergobox'
const VERSION = 1
const PARTES = 'partes'
const FOTOS = 'fotos'

export type ParteEncolado = {
  /** El id real de la fila en Postgres. La visita se planifica con cobertura. */
  parteId: string
  servicioId: string
  trabajoHecho: string | null
  piezas: string | null
  estadoAntes: Semaforo | null
  estadoDespues: Semaforo | null
  damper: number | null
  dragFactor: number | null
  minutos: number | null
  hecho: boolean
  actualizadoEn: number
}

export type FotoEncolada = {
  /** Id local. También es el nombre del fichero en el bucket, así que reintentar no duplica. */
  id: string
  parteId: string
  clienteId: string
  servicioId: string
  momento: 'antes' | 'despues'
  orden: number
  blob: Blob
  bytes: number
  creadaEn: number
}

export type Pendientes = { partes: number; fotos: number; bytes: number }

let promesaBd: Promise<IDBDatabase> | null = null

function abrir(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Sin IndexedDB'))
  if (promesaBd) return promesaBd

  promesaBd = new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(BD, VERSION)
    peticion.onupgradeneeded = () => {
      const bd = peticion.result
      if (!bd.objectStoreNames.contains(PARTES)) bd.createObjectStore(PARTES, { keyPath: 'parteId' })
      if (!bd.objectStoreNames.contains(FOTOS)) {
        const almacen = bd.createObjectStore(FOTOS, { keyPath: 'id' })
        almacen.createIndex('parteId', 'parteId')
      }
    }
    peticion.onsuccess = () => resolver(peticion.result)
    peticion.onerror = () => rechazar(peticion.error)
  })

  return promesaBd
}

function conTransaccion<T>(
  almacenes: string[],
  modo: IDBTransactionMode,
  trabajo: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  return abrir().then(
    (bd) =>
      new Promise<T>((resolver, rechazar) => {
        const tx = bd.transaction(almacenes, modo)
        let resultado: T
        Promise.resolve(trabajo(tx)).then(
          (v) => {
            resultado = v
          },
          rechazar,
        )
        tx.oncomplete = () => resolver(resultado)
        tx.onerror = () => rechazar(tx.error)
        tx.onabort = () => rechazar(tx.error)
      }),
  )
}

function pedir<T>(peticion: IDBRequest<T>): Promise<T> {
  return new Promise((resolver, rechazar) => {
    peticion.onsuccess = () => resolver(peticion.result)
    peticion.onerror = () => rechazar(peticion.error)
  })
}

// ── Escritura local ──────────────────────────────────────────────────────────

export async function guardarParteLocal(
  parte: Omit<ParteEncolado, 'actualizadoEn'>,
): Promise<void> {
  const entrada: ParteEncolado = { ...parte, actualizadoEn: Date.now() }
  await conTransaccion([PARTES], 'readwrite', (tx) => {
    tx.objectStore(PARTES).put(entrada)
  })
}

export async function encolarFoto(foto: Omit<FotoEncolada, 'creadaEn'>): Promise<void> {
  await conTransaccion([FOTOS], 'readwrite', (tx) => {
    tx.objectStore(FOTOS).put({ ...foto, creadaEn: Date.now() })
  })
}

export async function fotosDe(parteId: string): Promise<FotoEncolada[]> {
  return conTransaccion([FOTOS], 'readonly', (tx) =>
    pedir(tx.objectStore(FOTOS).index('parteId').getAll(parteId)),
  )
}

export async function borrarFotoLocal(id: string): Promise<void> {
  await conTransaccion([FOTOS], 'readwrite', (tx) => {
    tx.objectStore(FOTOS).delete(id)
  })
}

export async function contarPendientes(): Promise<Pendientes> {
  try {
    /*
     * Las dos peticiones se lanzan antes de esperar a ninguna. Una transacción
     * de IndexedDB se cierra sola en cuanto el bucle de eventos se queda sin
     * peticiones vivas, así que hacer `await` de la primera y pedir la segunda
     * después revienta con TransactionInactiveError en cuanto el móvil va justo.
     */
    const { partes, fotos } = await conTransaccion([PARTES, FOTOS], 'readonly', (tx) => {
      const p = pedir(tx.objectStore(PARTES).getAll() as IDBRequest<ParteEncolado[]>)
      const f = pedir(tx.objectStore(FOTOS).getAll() as IDBRequest<FotoEncolada[]>)
      return Promise.all([p, f]).then(([partes, fotos]) => ({ partes, fotos }))
    })

    return {
      partes: partes.length,
      fotos: fotos.length,
      bytes: fotos.reduce((suma, f) => suma + f.bytes, 0),
    }
  } catch {
    return { partes: 0, fotos: 0, bytes: 0 }
  }
}

// ── Sincronización ───────────────────────────────────────────────────────────

export type ResultadoSync = { subidas: number; fallos: number; pendientes: Pendientes }

let sincronizando = false

/**
 * Vacía la cola contra Supabase.
 *
 * Orden deliberado: primero las fotos, después los partes. Cerrar un parte es lo
 * que dispara el histórico y mueve el semáforo de la máquina, así que tiene que
 * ser lo último que llegue: si llegara antes que sus fotos y ahí se cortara la
 * red, el cliente vería un servicio cerrado sin la prueba de que se hizo.
 *
 * Cada elemento se borra de la cola solo cuando el servidor lo confirma. Un
 * fallo deja la entrada donde está y se reintenta en la siguiente pasada.
 */
export async function sincronizar(): Promise<ResultadoSync> {
  if (sincronizando) return { subidas: 0, fallos: 0, pendientes: await contarPendientes() }
  sincronizando = true

  let subidas = 0
  let fallos = 0

  try {

    const fotos = (await conTransaccion([FOTOS], 'readonly', (tx) =>
      pedir(tx.objectStore(FOTOS).getAll()),
    )) as FotoEncolada[]

    for (const foto of fotos.sort((a, b) => a.creadaEn - b.creadaEn)) {
      const ruta = `${foto.clienteId}/${foto.servicioId}/${foto.parteId}/${foto.id}.jpg`

      const subida = await supabase.storage
        .from('fotos')
        .upload(ruta, foto.blob, { contentType: 'image/jpeg', upsert: true })

      if (subida.error) {
        fallos++
        continue
      }

      // `upsert: true` arriba y `onConflict` aquí: reintentar la misma foto la
      // pisa en vez de duplicarla, porque el id local es estable.
      const fila = await supabase
        .from('fotos')
        .upsert(
          {
            parte_id: foto.parteId,
            momento: foto.momento,
            ruta,
            orden: foto.orden,
            bytes: foto.bytes,
          },
          { onConflict: 'ruta' },
        )

      if (fila.error) {
        fallos++
        continue
      }

      await borrarFotoLocal(foto.id)
      subidas++
    }

    const partes = (await conTransaccion([PARTES], 'readonly', (tx) =>
      pedir(tx.objectStore(PARTES).getAll()),
    )) as ParteEncolado[]

    for (const parte of partes.sort((a, b) => a.actualizadoEn - b.actualizadoEn)) {
      // Un parte con fotos todavía en cola espera: primero la prueba, luego el
      // cierre. Sin esto, una red que se corta a medias deja el histórico
      // diciendo que se hizo un trabajo del que no hay ni una foto.
      const suyas = await fotosDe(parte.parteId)
      if (suyas.length > 0) continue

      const { error } = await supabase
        .from('partes')
        .update({
          trabajo_hecho: parte.trabajoHecho,
          piezas: parte.piezas,
          estado_antes: parte.estadoAntes,
          estado_despues: parte.estadoDespues,
          damper: parte.damper,
          drag_factor: parte.dragFactor,
          minutos: parte.minutos,
          hecho: parte.hecho,
        })
        .eq('id', parte.parteId)

      if (error) {
        fallos++
        continue
      }

      /*
       * Leer y borrar dentro de la misma transacción, encadenando por callback y
       * no por await: entre dos `await` la transacción ya se ha cerrado sola, y
       * el borrado saltaría con TransactionInactiveError dejando la entrada en
       * la cola para siempre.
       *
       * Si el técnico volvió a tocar el parte mientras la petición viajaba, la
       * versión nueva se queda encolada para la siguiente pasada.
       */
      await conTransaccion([PARTES], 'readwrite', (tx) => {
        const almacen = tx.objectStore(PARTES)
        const lectura = almacen.get(parte.parteId) as IDBRequest<ParteEncolado | undefined>
        lectura.onsuccess = () => {
          const actual = lectura.result
          if (actual && actual.actualizadoEn <= parte.actualizadoEn) almacen.delete(parte.parteId)
        }
      })
      subidas++
    }
  } catch {
    fallos++
  } finally {
    sincronizando = false
  }

  return { subidas, fallos, pendientes: await contarPendientes() }
}
