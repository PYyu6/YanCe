/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        rock: {
          50: '#faf5f0',
          100: '#f0e6d8',
          200: '#e0ccb0',
          300: '#cda87e',
          400: '#bb8654',
          500: '#a86e3c',
          600: '#8c5630',
          700: '#704229',
          800: '#5c3726',
          900: '#4d2f23',
        },
        climb: {
          easy: '#22c55e',
          moderate: '#eab308',
          limit: '#f97316',
          dynamic: '#ef4444',
          unreachable: '#6b7280',
        },
      },
    },
  },
  plugins: [],
};
