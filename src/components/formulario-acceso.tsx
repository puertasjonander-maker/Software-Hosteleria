import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

/** Traduce los errores de Supabase, que llegan en inglés y en jerga. */
function mensajeDeError(mensaje: string): string {
  if (/invalid login credentials/i.test(mensaje)) {
    return 'Correo o contraseña incorrectos.'
  }
  if (/email not confirmed/i.test(mensaje)) {
    return 'Tu cuenta aún no está confirmada. Escríbenos y la activamos.'
  }
  if (/failed to fetch|network/i.test(mensaje)) {
    return 'No hay conexión con el servidor. Comprueba la red e inténtalo otra vez.'
  }
  return 'No hemos podido entrar. Inténtalo de nuevo.'
}

export function FormularioAcceso() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)

    const { error: fallo } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (fallo) {
      setError(mensajeDeError(fallo.message))
      setEnviando(false)
      return
    }

    /*
     * Aquí no se navega. El proveedor de sesión se entera por
     * `onAuthStateChange`, carga el perfil y esta misma pantalla se aparta sola
     * hacia donde tocaba. Navegar además provocaría una carrera: se llegaría a
     * la pantalla de destino antes de saber el rol, y el guarda rebotaría.
     *
     * `enviando` se queda puesto a propósito, para que el botón no vuelva a
     * decir "Entrar" durante el instante que tarda el cambio.
     */
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@ejemplo.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando ? <Loader2 className="animate-spin" /> : null}
            {enviando ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
