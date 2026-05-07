/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        // Slate overridden to use CSS variables so a single class
        // (e.g. bg-slate-900) renders dark in dark-mode and light in light-mode
        // via the inverted variable values defined in index.css.
        slate: {
          50:  'rgb(var(--sl-50)  / <alpha-value>)',
          100: 'rgb(var(--sl-100) / <alpha-value>)',
          200: 'rgb(var(--sl-200) / <alpha-value>)',
          300: 'rgb(var(--sl-300) / <alpha-value>)',
          400: 'rgb(var(--sl-400) / <alpha-value>)',
          500: 'rgb(var(--sl-500) / <alpha-value>)',
          600: 'rgb(var(--sl-600) / <alpha-value>)',
          700: 'rgb(var(--sl-700) / <alpha-value>)',
          800: 'rgb(var(--sl-800) / <alpha-value>)',
          900: 'rgb(var(--sl-900) / <alpha-value>)',
          950: 'rgb(var(--sl-950) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
