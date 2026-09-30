/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    fontSize: {
      xs: ['12px', '16px'],
      sm: ['13px', '18px'],
      base: ['15px', '22px'],
      lg: ['20px', '26px'],
      xl: ['32px', '34px'],
      '2xl': ['56px', '54px'],
    },
    extend: {
      colors: {
        lime: 'rgb(var(--lime) / <alpha-value>)',
        forest: 'rgb(var(--forest) / <alpha-value>)',
        sage: 'rgb(var(--sage) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        gain: 'rgb(var(--gain) / <alpha-value>)',
        loss: 'rgb(var(--loss) / <alpha-value>)',
        target: 'rgb(var(--target) / <alpha-value>)',
        hair: 'rgb(var(--hair) / <alpha-value>)',
      },
      fontFamily: {
        head: ['"Inter Tight"', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
        logo: ['Gloock', 'serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      borderRadius: { card: '10px', frame: '28px' },
    },
  },
}
