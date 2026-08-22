import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Semántica de estado propia de Mise
        warn: {
          DEFAULT: 'hsl(var(--warn))',
          foreground: 'hsl(var(--warn-foreground))',
        },
        ok: {
          DEFAULT: 'hsl(var(--ok))',
          foreground: 'hsl(var(--ok-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      /*
       * Escala tipográfica de Mise. Siete escalones con un trabajo cada uno; el
       * que faltaba era `dato`: hasta ahora un importe se pintaba con la misma
       * clase que un contador de solicitudes, así que lo que sirve para decidir
       * competía con lo que sirve para acompañar.
       *
       * Solo tamaño, interlineado y tracking. El peso va como clase aparte
       * (`font-semibold`) para que no dependa del orden de las utilidades.
       */
      fontSize: {
        micro: ['0.6875rem', { lineHeight: '0.875rem' }], // 11/14 — apoyos
        meta: ['0.8125rem', { lineHeight: '1.125rem' }], // 13/18 — unidad, proveedor, fecha
        cuerpo: ['0.9375rem', { lineHeight: '1.25rem' }], // 15/20 — texto normal
        tarjeta: ['1.0625rem', { lineHeight: '1.375rem', letterSpacing: '-0.01em' }], // 17/22
        dato: ['1.25rem', { lineHeight: '1.5rem' }], // 20/24 — importes y cantidades
        pantalla: ['1.5rem', { lineHeight: '1.75rem', letterSpacing: '-0.02em' }], // 24/28
        seccion: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.08em' }], // 12/16 versalita
      },
      /*
       * Movimiento: tres duraciones y tres curvas, y nada más. Antes todo era
       * `transition-colors` sin duración declarada — 150 ms con la curva por
       * defecto, lo mismo para un foco que para algo que aparece.
       */
      transitionDuration: {
        rapido: '120ms', // color y opacidad de respuesta al toque
        base: '200ms', // entrar, salir, mover el indicador
        amplio: '320ms', // diálogos y hojas
      },
      transitionTimingFunction: {
        // Entra y se posa. Es la que hace el 90 % del trabajo.
        salida: 'cubic-bezier(0.32, 0.72, 0, 1)',
        // Se va: acelera y desaparece. Nadie espera a una salida.
        entrada: 'cubic-bezier(0.4, 0, 1, 1)',
        // Solo color, para lo que no se mueve de sitio.
        estandar: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        // Nada viaja más de 12 px al cambiar de pantalla ni más de 4 px dentro
        // de una lista: la suavidad la da la curva, no la distancia.
        'entrada-pagina': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'entrada-fila': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        // El «−» del stepper crece en su sitio en vez de montarse de golpe y
        // pegarle un tirón de 44 px a la fila.
        'abrir-stepper': {
          from: { width: '0', opacity: '0' },
          to: { width: '2.75rem', opacity: '1' },
        },
        'pop-cantidad': {
          '0%': { transform: 'scale(0.92)' },
          '55%': { transform: 'scale(1.06)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 200ms cubic-bezier(0.32, 0.72, 0, 1)',
        'accordion-up': 'accordion-up 200ms cubic-bezier(0.4, 0, 1, 1)',
        // `backwards` y no `both`: el estado inicial se aplica antes de arrancar
        // (para que no haya destello, y para que un retardo escalonado aguante
        // la fila oculta), pero al terminar no queda un `transform` permanente
        // creando bloques contenedores donde no toca.
        'entrada-pagina': 'entrada-pagina 200ms cubic-bezier(0.32, 0.72, 0, 1) backwards',
        'entrada-fila': 'entrada-fila 200ms cubic-bezier(0.32, 0.72, 0, 1) backwards',
        'abrir-stepper': 'abrir-stepper 200ms cubic-bezier(0.32, 0.72, 0, 1) backwards',
        'pop-cantidad': 'pop-cantidad 140ms cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
