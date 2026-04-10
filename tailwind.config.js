/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#05070F',
          900: '#0A0F1E',
          800: '#111729',
          700: '#1A2138',
        },
        brand: {
          cyan: '#06B6D4',
          blue: '#3B82F6',
          glow: '#22D3EE',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'Sora',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(34,211,238,0.25), 0 10px 40px -10px rgba(34,211,238,0.35)',
        card: '0 10px 30px -15px rgba(0,0,0,0.6)',
      },
      backgroundImage: {
        'grid-fade':
          'radial-gradient(ellipse at top, rgba(34,211,238,0.12), transparent 60%)',
      },
      animation: {
        'pulse-slow': 'pulse 6s cubic-bezier(0.4,0,0.6,1) infinite',
        'float': 'float 8s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
      },
    },
  },
  plugins: [],
}
