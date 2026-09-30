import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useSesionActiva, useSesion } from '@/lib/sesion'
import { inicioSegunRol } from '@/lib/roles'
import { elegirContrasena } from '@/datos/usuarios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTitulo } from '@/components/cargador'

const MINIMO = 8

/**
 * Elegir la contraseña propia.
 *
 * Es la pantalla a la que obliga la primera entrada: el acceso llega con una
 * contraseña temporal que ha pasado por un correo o un WhatsApp, y no puede seguir
 * valiendo. También se abre a propósito desde el menú de la cuenta, y entonces
 * tiene salida; cuando es obligatoria, no.
 */
export default function CambiarContrasena() {
  useTitulo('Elige tu contraseña')
  const sesion = useSesionActiva()
  const { refrescar } = useSesion()
  const navegar = useNavigate()

  const obligatoria = sesion.perfil.debe_cambiar_contrasena
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (nueva.length < MINIMO) {
      setError(`Mínimo ${MINIMO} caracteres. Una frase corta sirve y se recuerda mejor.`)
      return
    }
    if (nueva !== repetida) {
      setError('Las dos contraseñas no coinciden.')
      return
    }

    setEnviando(true)
    const r = await elegirContrasena(sesion.userId, nueva)
    if (!r.ok) {
      setError(r.mensaje)
      setEnviando(false)
      return
    }

    await refrescar()
    toast.success('Contraseña guardada')
    navegar(inicioSegunRol(sesion.perfil.rol), { replace: true })
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,hsl(var(--accent))_0%,hsl(var(--background))_60%)] px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <header className="space-y-3 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
            <ShieldCheck className="h-7 w-7" />
          </span>
          <h1 className="text-pantalla font-bold">
            {obligatoria ? 'Elige tu contraseña' : 'Cambiar contraseña'}
          </h1>
          <p className="text-cuerpo text-muted-foreground">
            {obligatoria
              ? 'La que has recibido es temporal. Escribe una que solo sepas tú; la usarás para entrar a partir de ahora.'
              : 'Escribe la nueva. La anterior deja de valer en cuanto la guardes.'}
          </p>
        </header>

        <form onSubmit={enviar} className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
          <div className="space-y-2">
            <Label htmlFor="nueva">Contraseña nueva</Label>
            <Input
              id="nueva"
              type="password"
              autoComplete="new-password"
              required
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
            />
            <p className="texto-meta">Mínimo {MINIMO} caracteres.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="repetida">Repítela</Label>
            <Input
              id="repetida"
              type="password"
              autoComplete="new-password"
              required
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando ? <Loader2 className="animate-spin" /> : null}
            Guardar y entrar
          </Button>

          {!obligatoria ? (
            <Button asChild variant="ghost" className="w-full">
              <Link to={inicioSegunRol(sesion.perfil.rol)}>Cancelar</Link>
            </Button>
          ) : null}
        </form>
      </div>
    </main>
  )
}
