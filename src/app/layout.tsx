import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import { RegistroServiceWorker } from '@/components/pwa/registro-service-worker'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Ergobox',
    template: '%s · Ergobox',
  },
  description:
    'Mantenimiento de parques de máquinas: inventario por box, visitas, partes de trabajo con fotos e historial por máquina.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Ergobox',
  appleWebApp: {
    capable: true,
    title: 'Ergobox',
    statusBarStyle: 'default',
  },
  formatDetection: {
    // Un número de serie o un drag factor de 199 no son números de teléfono.
    telephone: false,
  },
  icons: {
    icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/icon-180.png', sizes: '180x180' }],
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf7f2' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1614' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Sin maximumScale: bloquear el zoom rompe la accesibilidad, y un número de
  // serie medio borrado se lee acercándose.
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        {children}
        <Toaster position="top-center" richColors closeButton />
        <RegistroServiceWorker />
      </body>
    </html>
  )
}
