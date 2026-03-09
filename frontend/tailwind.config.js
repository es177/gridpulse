/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0a0a0f',
          panel: '#1a1a2e',
          hover: '#242445',
          card: '#16162b',
        },
        accent: {
          nuclear: '#a855f7',
          solar: '#eab308',
          wind: '#14b8a6',
          gas: '#f97316',
          coal: '#6b7280',
          hydro: '#3b82f6',
          alert: '#ef4444',
          green: '#22c55e',
        },
        border: {
          subtle: '#2a2a4a',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
