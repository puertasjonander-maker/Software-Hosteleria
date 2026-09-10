'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
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
  const router = useRouter()
  const searchParams = useSearchParams()
  const destino = searchParams.get('next') || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)

    const supabase = createClient()
    const { error: fallo } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (fallo) {
      setError(mensajeDeError(fallo.message))
      setEnviando(false)
      return
    }

    // refresh() para que el layout de servidor vuelva a leer la sesión antes de
    // navegar; sin él, la primera pantalla se pintaría todavía sin perfil.
    router.replace(destino)
    router.refresh()
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
