import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarAviso, pushDisponible, type Suscripcion } from '@/lib/push'
import { horaAMinutos, hoyEnMadrid, minutosAHora, partesEnMadrid } from '@/lib/time'
import type { RolUsuario } from '@/lib/database.types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const HORAS_POR_DEFECTO: Record<'encargado' | 'barista', number> = {
  encargado: 2,
  barista: 4,
}

/**
 * Recordatorio de corte (MISE-004).
 *
 * Corre desde Vercel Cron cada media hora y decide, proveedor a proveedor, si
 * toca avisar. Usa la service role key porque no hay usuario detrás de la
 * petición; por eso lo primero que hace es comprobar el secreto compartido.
 *
 * Reglas que implementa:
 *  · Se avisa a los baristas antes que al encargado: primero registrar lo que
 *    falta, después mandarlo.
 *  · Si el pedido de ese proveedor ya salió hoy, no se avisa a nadie.
 *  · Nunca más de un aviso por proveedor, público y día — lo garantiza el índice
 *    único de `reminder_log`, no una comprobación en memoria.
 */
export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET
  const cabecera = request.headers.get('authorization')

  if (!secreto || cabecera !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  if (!pushDisponible()) {
    return NextResponse.json({
      ok: true,
      omitido: 'Sin claves VAPID configuradas: no se envían avisos.',
    })
  }

  const supabase = createAdminClient()
  const ahora = new Date()
  const p = partesEnMadrid(ahora)
  const minutosAhora = p.hour * 60 + p.minute
  const hoy = hoyEnMadrid(ahora)

  const [pautas, ajustes, perfiles, suscripciones] = await Promise.all([
    supabase.from('supplier_schedules').select('*').eq('order_weekday', p.weekday),
    supabase.from('settings').select('*'),
    supabase.from('profiles').select('id, role, active'),
    supabase.from('push_subscriptions').select('*'),
  ])

  if (!pautas.data || pautas.data.length === 0) {
    return NextResponse.json({ ok: true, avisos: 0, motivo: 'Hoy no hay cortes' })
  }

  const horas = { ...HORAS_POR_DEFECTO }
  for (const fila of ajustes.data ?? []) {
    const numero = Number(fila.value)
    if (!Number.isFinite(numero)) continue
    if (fila.key === 'reminder_hours_encargado') horas.encargado = numero
    if (fila.key === 'reminder_hours_barista') horas.barista = numero
  }

  const idsProveedor = pautas.data.map((s) => s.supplier_id)

  const [proveedores, pedidosHoy, pendientes] = await Promise.all([
    supabase.from('suppliers').select('id, name').in('id', idsProveedor).eq('active', true),
    supabase
      .from('orders')
      .select('supplier_id, status, sent_at')
      .in('supplier_id', idsProveedor)
      .neq('status', 'borrador')
      .gte('sent_at', `${hoy}T00:00:00Z`),
    supabase.from('pending_by_supplier').select('supplier_id, line_count'),
  ])

  const nombreProveedor = new Map((proveedores.data ?? []).map((s) => [s.id, s.name]))
  const yaEnviadoHoy = new Set((pedidosHoy.data ?? []).map((o) => o.supplier_id))
  const lineasPendientes = new Map(
    (pendientes.data ?? []).map((f) => [f.supplier_id, Number(f.line_count)]),
  )

  const suscripcionesPorPerfil = new Map<string, Suscripcion[]>()
  for (const s of suscripciones.data ?? []) {
    const lista = suscripcionesPorPerfil.get(s.profile_id) ?? []
    lista.push({ id: s.id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth })
    suscripcionesPorPerfil.set(s.profile_id, lista)
  }

  const activosPorRol = new Map<RolUsuario, string[]>()
  for (const perfil of perfiles.data ?? []) {
    if (!perfil.active) continue
    const lista = activosPorRol.get(perfil.role) ?? []
    lista.push(perfil.id)
    activosPorRol.set(perfil.role, lista)
  }

  let avisosEnviados = 0
  const caducadas: string[] = []
  const detalle: string[] = []

  for (const pauta of pautas.data) {
    const nombre = nombreProveedor.get(pauta.supplier_id)
    if (!nombre) continue // proveedor inactivo

    if (yaEnviadoHoy.has(pauta.supplier_id)) {
      detalle.push(`${nombre}: ya enviado hoy`)
      continue
    }

    const minutoCorte = horaAMinutos(pauta.cutoff_time)
    const minutosRestantes = minutoCorte - minutosAhora
    if (minutosRestantes <= 0) continue // el corte ya pasó: avisar ahora es ruido

    const lineas = lineasPendientes.get(pauta.supplier_id) ?? 0

    const publicos: { rol: RolUsuario; ventana: number; debeAvisar: boolean }[] = [
      // Al barista se le avisa aunque no haya nada pendiente: el aviso es
      // justamente para que mire si falta algo antes de que cierre el pedido.
      { rol: 'barista', ventana: horas.barista * 60, debeAvisar: true },
      // Al encargado solo si hay algo que mandar.
      { rol: 'encargado', ventana: horas.encargado * 60, debeAvisar: lineas > 0 },
    ]

    for (const publico of publicos) {
      if (!publico.debeAvisar) continue
      if (minutosRestantes > publico.ventana) continue

      // El registro es la cerradura: si la fila ya existe, este aviso ya salió.
      const { error } = await supabase.from('reminder_log').insert({
        supplier_id: pauta.supplier_id,
        audience: publico.rol,
        sent_on: hoy,
      })
      if (error) continue // conflicto de unicidad: ya avisado

      const destinatarios = (activosPorRol.get(publico.rol) ?? []).flatMap(
        (id) => suscripcionesPorPerfil.get(id) ?? [],
      )
      if (destinatarios.length === 0) continue

      const horaCorte = minutosAHora(minutoCorte)
      const cuerpo =
        publico.rol === 'barista'
          ? lineas > 0
            ? `Corte a las ${horaCorte}. Hay ${lineas} ${lineas === 1 ? 'producto pedido' : 'productos pedidos'}: mira si falta algo más.`
            : `Corte a las ${horaCorte} y no hay nada pedido todavía. ¿Falta algo?`
          : `Corte a las ${horaCorte}. Hay ${lineas} ${lineas === 1 ? 'línea pendiente' : 'líneas pendientes'} sin enviar.`

      const resultado = await enviarAviso(destinatarios, {
        title: nombre,
        body: cuerpo,
        // Directo a la pantalla accionable, no al inicio (MISE-004).
        url: publico.rol === 'barista' ? '/pedir' : '/pedidos',
        tag: `corte-${pauta.supplier_id}-${publico.rol}`,
      })

      avisosEnviados += resultado.enviados
      caducadas.push(...resultado.caducadas)
      detalle.push(`${nombre} → ${publico.rol}: ${resultado.enviados} avisos`)
    }
  }

  if (caducadas.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', caducadas)
  }

  return NextResponse.json({
    ok: true,
    avisos: avisosEnviados,
    suscripcionesLimpiadas: caducadas.length,
    detalle,
  })
}
