'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Loader2, Mail, MessageCircle, Phone } from 'lucide-react'
import { toast } from 'sonner'
import type { CanalContacto } from '@/lib/database.types'
import { ETIQUETA_CANAL } from '@/lib/roles'
import { enlaceCorreo, enlaceWhatsApp, NOMBRE_ORG } from '@/lib/message'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { marcarEnviado } from '../acciones'

/**
 * Generar, revisar y enviar el pedido (MISE-003).
 *
 * La pieza importante no es el botón de WhatsApp: es que abrir WhatsApp y
 * marcar como enviado son dos actos distintos. Si alguien abre el chat y se
 * arrepiente, el pedido sigue en borrador y la pantalla lo dice — la ambigüedad
 * sobre si el pedido salió es exactamente lo que este bloque viene a quitar.
 */
export function EnviarPedido({
  orderId,
  mensaje,
  canalPorDefecto,
  contacto,
  proveedorNombre,
  entrega,
  hayLineas,
}: {
  orderId: string
  mensaje: string
  canalPorDefecto: CanalContacto
  contacto: string
  proveedorNombre: string
  entrega: string | null
  hayLineas: boolean
}) {
  const router = useRouter()
  const [canal, setCanal] = useState<CanalContacto>(canalPorDefecto)
  const [abierto, setAbierto] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [pendiente, iniciar] = useTransition()

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje)
      setCopiado(true)
      setAbierto(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('Tu navegador no ha dejado copiar', {
        description: 'Selecciona el texto de la vista previa y cópialo a mano.',
      })
    }
  }

  function abrirCanal() {
    const destino =
      canal === 'whatsapp'
        ? enlaceWhatsApp(contacto, mensaje)
        : canal === 'email'
          ? enlaceCorreo(contacto, `Pedido ${NOMBRE_ORG} · ${proveedorNombre}`, mensaje)
          : `tel:${contacto.replace(/[^\d+]/g, '')}`

    setAbierto(true)
    window.open(destino, '_blank', 'noopener,noreferrer')
  }

  const IconoCanal = canal === 'whatsapp' ? MessageCircle : canal === 'email' ? Mail : Phone

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Enviar</CardTitle>
        <p className="text-sm text-muted-foreground">
          Revisa el texto antes de mandarlo. Es exactamente lo que verá el proveedor.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Vista previa en monospace: lo que se ve es lo que se manda. */}
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
          {mensaje}
        </pre>

        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40 space-y-1.5">
            <Label htmlFor="canal">Canal</Label>
            <Select
              id="canal"
              value={canal}
              onChange={(e) => setCanal(e.target.value as CanalContacto)}
            >
              {(['whatsapp', 'email', 'telefono'] as const).map((c) => (
                <option key={c} value={c}>
                  {ETIQUETA_CANAL[c]}
                </option>
              ))}
            </Select>
          </div>

          <Button variant="outline" onClick={abrirCanal} disabled={!hayLineas}>
            <IconoCanal />
            Abrir en {ETIQUETA_CANAL[canal]}
          </Button>

          <Button variant="outline" onClick={copiar} disabled={!hayLineas}>
            {copiado ? <Check /> : <Copy />}
            {copiado ? 'Copiado' : 'Copiar'}
          </Button>
        </div>

        {abierto ? (
          <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
            Aún no está marcado como enviado. Si el proveedor ya lo tiene, confírmalo abajo;
            si te has arrepentido, no hagas nada: sigue siendo un borrador.
          </div>
        ) : null}

        <div className="border-t pt-4">
          <Button
            className="w-full sm:w-auto"
            disabled={!hayLineas || pendiente}
            onClick={() =>
              iniciar(async () => {
                const resultado = await marcarEnviado(orderId, mensaje, canal, entrega)
                if (resultado.ok) {
                  toast.success('Pedido marcado como enviado')
                  router.refresh()
                } else {
                  toast.error(resultado.mensaje)
                }
              })
            }
          >
            {pendiente ? <Loader2 className="animate-spin" /> : <Check />}
            Marcar como enviado
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            A partir de ahí el pedido es inmutable: se guarda copia del texto y las
            solicitudes pasan a &laquo;en pedido&raquo;. Para corregir algo se manda un
            pedido complementario.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
