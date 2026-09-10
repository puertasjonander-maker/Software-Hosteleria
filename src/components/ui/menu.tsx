import * as React from 'react'
import * as MenuPrimitive from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/utils'

/**
 * Menú desplegable mínimo, solo con lo que la app usa hoy: la identidad de la
 * cabecera. Las duraciones salen de los tokens (`rapido` para el fundido,
 * `salida` para posarse) en vez de los valores por defecto de shadcn.
 */

const Menu = MenuPrimitive.Root
const MenuTrigger = MenuPrimitive.Trigger

const MenuContent = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => (
  <MenuPrimitive.Portal>
    <MenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[13rem] overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-md',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        'data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1',
        'duration-base ease-salida',
        className,
      )}
      {...props}
    />
  </MenuPrimitive.Portal>
))
MenuContent.displayName = MenuPrimitive.Content.displayName

const MenuItem = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <MenuPrimitive.Item
    ref={ref}
    className={cn(
      // 44 px también aquí: el menú se abre con el pulgar, igual que el resto.
      'relative flex h-11 cursor-default select-none items-center gap-2 rounded-md px-3 text-cuerpo outline-none',
      'transition-colors duration-rapido ease-estandar',
      'focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      '[&_svg]:size-4 [&_svg]:shrink-0',
      className,
    )}
    {...props}
  />
))
MenuItem.displayName = MenuPrimitive.Item.displayName

const MenuLabel = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <MenuPrimitive.Label ref={ref} className={cn('px-3 py-2', className)} {...props} />
))
MenuLabel.displayName = MenuPrimitive.Label.displayName

const MenuSeparator = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <MenuPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
))
MenuSeparator.displayName = MenuPrimitive.Separator.displayName

export { Menu, MenuTrigger, MenuContent, MenuItem, MenuLabel, MenuSeparator }
