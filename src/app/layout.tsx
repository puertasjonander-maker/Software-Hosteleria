import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import { RegistroServiceWorker } from '@/components/pwa/registro-service-worker'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Mise',
    template: '%s · Mise',
  },
  description:
    'Aprovisionamiento para hostelería: registrar faltas, agrupar pedidos por proveedor, recibir mercancía y ver el gasto.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Mise',
  appleWebApp: {
    capable: true,
    title: 'Mise',
    statusBarStyle: 'default',
  },
  formatDetection: {
    // Un "caja 6 ud" o un "1,5 kg" no son números de teléfono.
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
  // Sin maximumScale: bloquear el zoom rompe la accesibilidad y en una cocina
  // hay gente que necesita acercarse al precio.
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
