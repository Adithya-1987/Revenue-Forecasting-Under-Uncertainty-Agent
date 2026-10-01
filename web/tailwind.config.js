/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    fontSize: {
      '2xs': ['11px', '14px'],
      xs: ['12px', '16px'],
      sm: ['13px', '20px'],
      base: ['15px', '24px'],
      md: ['16px', '24px'],
      lg: ['18px', '28px'],
      xl: ['22px', '30px'],
      '2xl': ['28px', '36px'],
      '3xl': ['36px', '42px'],
      '4xl': ['48px', '52px'],
      '5xl': ['64px', '66px'],
    },
    extend: {
      colors: {
        // Ember on frosted glass. Values live in index.css.
        canvas: token('canvas'),
        rail: token('rail'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        line: token('line'),
        ink: token('ink'),
        muted: token('muted'),
        faint: token('faint'),
        brand: token('brand'),
        'brand-soft': token('brand-soft'),
        'on-brand': token('on-brand'),
        accent: token('accent'),
        navy: token('navy'),
        'navy-2': token('navy-2'),
        gain: token('gain'),
        loss: token('loss'),
        target: token('target'),
        info: token('info'),
        mint: token('mint'),
        sky: token('sky'),
        lavender: token('lavender'),
      },
      fontFamily: {
        head: ['"Manrope Variable"', 'Manrope', 'system-ui', 'sans-serif'],
        sans: ['"Manrope Variable"', 'Manrope', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { card: '20px', frame: '30px' },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow) / 0.05), 0 10px 30px -14px rgb(var(--shadow) / 0.22)',
        lift: '0 2px 4px rgb(var(--shadow) / 0.06), 0 16px 36px -16px rgb(var(--shadow) / 0.3)',
        pop: '0 4px 8px rgb(var(--shadow) / 0.08), 0 24px 48px -20px rgb(var(--shadow) / 0.35)',
        frame: '0 40px 80px -40px rgb(var(--shadow) / 0.45), inset 0 1px 0 rgb(255 255 255 / 0.5)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
        'in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
    },
  },
}
