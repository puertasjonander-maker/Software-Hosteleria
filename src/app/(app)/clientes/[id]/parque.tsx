'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormularioMaquina } from './formulario-maquina'

/**
 * El único trozo del parque que necesita ser interactivo: el alta.
 *
 * La lista se pinta en servidor (`ListaParque`) desde que cada máquina tiene su
 * propia pantalla con historial. Antes la fila abría un diálogo y todo el parque
 * tenía que viajar al navegador para eso.
 */
export function BotonAnadirMaquina({
  clienteId,
  className,
}: {
  clienteId: string
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)

  return (
    <>
      <Button size="sm" variant="outline" className={className} onClick={() => setAbierto(true)}>
        <Plus /> Añadir máquina
      </Button>

      <FormularioMaquina
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        clienteId={clienteId}
        maquina={null}
      />
    </>
  )
}
