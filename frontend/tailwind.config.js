/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cyber: {
          50:  '#edfffe',
          100: '#c8fffd',
          200: '#92fffa',
          300: '#4dfbf7',
          400: '#15e8e4',
          500: '#00cbca',
          600: '#00a3a5',
          700: '#068183',
          800: '#0c6567',
          900: '#0e5355',
          950: '#003437',
        },
        neon: {
          green:  '#39ff14',
          blue:   '#00f3ff',
          purple: '#bc13fe',
          pink:   '#ff0090',
          orange: '#ff6600',
        },
        surface: {
          DEFAULT: '#0d1117',
          50:  '#f0f4ff',
          100: '#dce4f5',
          200: '#b9caea',
          300: '#8aa5d6',
          400: '#597fbe',
          500: '#3a61a7',
          600: '#2e4d8a',
          700: '#263d6e',
          800: '#1b2c52',
          900: '#111d38',
          950: '#0a1022',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'grid-dark': "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M0 0h1v40H0zM0 0h40v1H0z' stroke='%2300cbca1a' stroke-width='0.5'/%3E%3C/svg%3E\")",
        'grid-light': "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M0 0h1v40H0zM0 0h40v1H0z' stroke='%230ea5e91a' stroke-width='0.5'/%3E%3C/svg%3E\")",
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ping-slow':  'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
        'slide-in':   'slideIn 0.2s ease-out',
        'fade-in':    'fadeIn 0.15s ease-out',
      },
      keyframes: {
        slideIn: {
          from: { opacity: '0', transform: 'translateX(-8px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
