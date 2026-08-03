'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CanalContacto, RolUsuario, UnidadBase } from '@/lib/database.types'

export type Resultado = { ok: true } | { ok: false; mensaje: string }

function resultado(error: { message: string } | null, contexto?: string): Resultado {
  if (!error) return { ok: true }
  if (error.message.includes('duplicate key')) {
    return { ok: false, mensaje: `Ya existe ${contexto ?? 'un registro'} con ese nombre.` }
  }
  return { ok: false, mensaje: error.message }
}

async function exigirOperador(): Promise<Resultado> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, mensaje: 'Sesión no válida.' }

  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (data?.role !== 'operador') {
    return { ok: false, mensaje: 'Solo el operador puede administrar el catálogo.' }
  }
  return { ok: true }
}

// ── Locales ──────────────────────────────────────────────────────────────────

export async function guardarLocal(
  id: string | null,
  nombre: string,
  activo: boolean,
): Promise<Resultado> {
  const supabase = createClient()

  const { error } = id
    ? await supabase.from('locations').update({ name: nombre, active: activo }).eq('id', id)
    : await supabase.from('locations').insert({ name: nombre, active: activo })

  revalidatePath('/admin/locales')
  return resultado(error, 'un local')
}

// ── Proveedores ──────────────────────────────────────────────────────────────

export async function guardarProveedor(
  id: string | null,
  datos: {
    nombre: string
    canal: CanalContacto
    contacto: string
    notas: string | null
    activo: boolean
  },
): Promise<Resultado> {
  const supabase = createClient()
  const fila = {
    name: datos.nombre,
    contact_channel: datos.canal,
    contact_value: datos.contacto,
    notes: datos.notas,
    active: datos.activo,
  }

  const { error } = id
    ? await supabase.from('suppliers').update(fila).eq('id', id)
    : await supabase.from('suppliers').insert(fila)

  revalidatePath('/admin/proveedores')
  return resultado(error, 'un proveedor')
}

export async function guardarPauta(
  supplierId: string,
  pautas: {
    id?: string
    orderWeekday: number
    cutoffTime: string
    deliveryWeekday: number | null
    leadTimeDays: number
  }[],
): Promise<Resultado> {
  const supabase = createClient()

  // Se reemplaza la pauta completa en vez de intentar casar altas y bajas: son
  // dos o tres filas por proveedor y así no quedan huérfanas.
  const { error: errorBorrado } = await supabase
    .from('supplier_schedules')
    .delete()
    .eq('supplier_id', supplierId)

  if (errorBorrado) return resultado(errorBorrado)

  if (pautas.length === 0) {
    revalidatePath('/admin/proveedores')
    return { ok: true }
  }

  const { error } = await supabase.from('supplier_schedules').insert(
    pautas.map((p) => ({
      supplier_id: supplierId,
      order_weekday: p.orderWeekday,
      cutoff_time: p.cutoffTime,
      delivery_weekday: p.deliveryWeekday,
      lead_time_days: p.leadTimeDays,
    })),
  )

  revalidatePath('/admin/proveedores')
  revalidatePath('/pedidos')
  return resultado(error)
}

// ── Productos ────────────────────────────────────────────────────────────────

export async function guardarProducto(
  id: string | null,
  datos: {
    supplierId: string
    nombre: string
    categoria: string
    unidadPedido: string
    unidadBase: UnidadBase
    unidadesPorPedido: number
    ultimoPrecio: number | null
    activo: boolean
  },
): Promise<Resultado> {
  const supabase = createClient()
  const fila = {
    supplier_id: datos.supplierId,
    name: datos.nombre,
    category: datos.categoria,
    order_unit: datos.unidadPedido,
    base_unit: datos.unidadBase,
    units_per_order_unit: datos.unidadesPorPedido,
    last_known_price: datos.ultimoPrecio,
    active: datos.activo,
  }

  const { error } = id
    ? await supabase.from('products').update(fila).eq('id', id)
    : await supabase.from('products').insert(fila)

  revalidatePath('/admin/productos')
  revalidatePath('/pedir')
  return resultado(error, 'un producto de ese proveedor')
}

/**
 * Alta y baja masiva de productos en un local (MISE-000).
 *
 * Es la operación que hace usable la asignación: marcar 80 productos de uno en
 * uno no lo haría nadie, y un local sin catálogo asignado deja `/pedir` vacío.
 */
export async function asignarProductosALocal(
  locationId: string,
  productIds: string[],
  asignar: boolean,
): Promise<Resultado> {
  const supabase = createClient()

  if (productIds.length === 0) return { ok: true }

  const { error } = asignar
    ? await supabase.from('location_products').upsert(
        productIds.map((product_id) => ({ location_id: locationId, product_id, active: true })),
        { onConflict: 'location_id,product_id' },
      )
    : await supabase
        .from('location_products')
        .update({ active: false })
        .eq('location_id', locationId)
        .in('product_id', productIds)

  revalidatePath('/admin/productos')
  revalidatePath('/pedir')
  return resultado(error)
}

// ── Usuarios ─────────────────────────────────────────────────────────────────

/**
 * Alta de usuario. Es lo único de todo `/admin` que necesita la service role
 * key: crear una cuenta en `auth.users` no es una operación que la RLS pueda
 * autorizar, porque el usuario todavía no existe. Por eso se comprueba el rol a
 * mano antes — aquí sí hace falta.
 */
export async function crearUsuario(datos: {
  email: string
  password: string
  nombre: string
  rol: RolUsuario
  locationId: string | null
}): Promise<Resultado> {
  const permiso = await exigirOperador()
  if (!permiso.ok) return permiso

  if (datos.password.length < 8) {
    return { ok: false, mensaje: 'La contraseña tiene que tener al menos 8 caracteres.' }
  }
  if (datos.rol !== 'operador' && !datos.locationId) {
    return {
      ok: false,
      mensaje: 'Un barista o encargado necesita un local: sin él no puede pedir.',
    }
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return {
      ok: false,
      mensaje:
        'Falta SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor. Sin ella no se pueden crear cuentas.',
    }
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: datos.email.trim().toLowerCase(),
    password: datos.password,
    email_confirm: true,
    user_metadata: { full_name: datos.nombre },
  })

  if (error || !data.user) {
    if (error?.message?.includes('already been registered')) {
      return { ok: false, mensaje: 'Ese correo ya tiene cuenta.' }
    }
    return { ok: false, mensaje: error?.message ?? 'No se ha podido crear el usuario.' }
  }

  // El trigger de auth.users ya ha creado el perfil con valores por defecto;
  // aquí se le pone el rol y el local que ha elegido el operador.
  const { error: errorPerfil } = await admin
    .from('profiles')
    .update({
      full_name: datos.nombre,
      role: datos.rol,
      location_id: datos.locationId,
      active: true,
    })
    .eq('id', data.user.id)

  revalidatePath('/admin/usuarios')
  return resultado(errorPerfil)
}

export async function actualizarUsuario(
  id: string,
  datos: { nombre: string; rol: RolUsuario; locationId: string | null; activo: boolean },
): Promise<Resultado> {
  const supabase = createClient()

  if (datos.rol !== 'operador' && !datos.locationId) {
    return { ok: false, mensaje: 'Un barista o encargado necesita un local asignado.' }
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: datos.nombre,
      role: datos.rol,
      location_id: datos.rol === 'operador' ? null : datos.locationId,
      active: datos.activo,
    })
    .eq('id', id)

  revalidatePath('/admin/usuarios')
  return resultado(error)
}

// ── Ajustes ──────────────────────────────────────────────────────────────────

export async function guardarAjuste(clave: string, valor: number): Promise<Resultado> {
  const supabase = createClient()

  const { error } = await supabase
    .from('settings')
    .upsert({ key: clave, value: valor, updated_at: new Date().toISOString() })

  revalidatePath('/admin/ajustes')
  return resultado(error)
}
