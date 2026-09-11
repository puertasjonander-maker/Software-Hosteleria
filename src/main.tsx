import { cargarConfiguracion } from '@/lib/configuracion'

/**
 * El arranque, antes de React.
 *
 * La configuración se busca primero y la aplicación se carga después, con un
 * `import` dinámico. El orden importa: el cliente de Supabase se construye en
 * cuanto su módulo se importa, así que si la aplicación entrara primero, se
 * construiría sin saber a dónde conectarse.
 *
 * Y si no hay configuración, lo que se ve es qué falta. Una pantalla en blanco
 * sin explicación, en el móvil y dentro de un box, es la peor manera posible de
 * enterarse de que falta un fichero.
 */

/*
 * Envuelto en una función en vez de `await` suelto: el `await` de nivel superior
 * exige un objetivo de compilación más moderno, y subirlo dejaría fuera a los
 * iPhone que no han actualizado. Un técnico no cambia de móvil porque salga una
 * versión de Safari.
 */
void (async () => {
  if (await cargarConfiguracion()) await import('@/arranque')
  else pintarFaltaConfiguracion()
})()

function pintarFaltaConfiguracion() {
  const raiz = document.getElementById('raiz')
  if (!raiz) return

  // Estilos en línea a propósito: la hoja de estilos viaja con la aplicación, y
  // si estamos aquí es justo porque la aplicación no ha llegado a cargarse.
  raiz.innerHTML = `
    <main style="
      font: 16px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
      color: #1a1614; background: #faf7f2;
      min-height: 100dvh; display: flex; align-items: center; justify-content: center;
      padding: 2rem; margin: 0;
    ">
      <div style="max-width: 30rem">
        <h1 style="font-size: 1.25rem; margin: 0 0 .75rem">Falta configurar Ergobox</h1>
        <p style="margin: 0 0 1rem">
          La aplicación está publicada, pero no sabe a qué base de datos conectarse.
        </p>
        <p style="margin: 0 0 .5rem">
          Junto a <code>index.html</code>, en el servidor, tiene que haber un fichero
          llamado <strong>config.json</strong> con esto dentro:
        </p>
        <pre style="
          background: #fff; border: 1px solid #e6ded2; border-radius: .5rem;
          padding: .75rem; overflow-x: auto; font-size: .875rem; margin: 0 0 1rem
        ">{
  "supabaseUrl": "https://xxxx.supabase.co",
  "supabaseAnonKey": "eyJhbGciOi...",
  "vapidPublicKey": ""
}</pre>
        <p style="margin: 0; color: #6b625a; font-size: .875rem">
          Los dos primeros valores salen del panel de Supabase, en
          Project Settings → API. El tercero puede quedarse vacío: solo hace falta
          para los avisos de revisión.
        </p>
      </div>
    </main>
  `
}
