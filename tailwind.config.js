/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        hm: {
          bg: '#020408',
          surface: '#080D14',
          'surface-2': '#0C131C',
          border: 'rgba(0,200,255,0.12)',
          'border-hi': 'rgba(0,200,255,0.45)',
          cyan: '#00C8FF',
          violet: '#7B2FFF',
          green: '#00FF94',
          text: '#F0F4FF',
          muted: '#6B7FA3',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        'widest-2': '0.15em',
      },
    },
  },
  plugins: [],
}
