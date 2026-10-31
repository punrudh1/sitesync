import type { Config } from 'tailwindcss';

// Brand colours live here and in globals.css so the identity is easy to change.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#0f172a', 900: '#1e293b', 700: '#334155', 500: '#64748b' },
        brand: { DEFAULT: '#c2410c', dark: '#9a3412', light: '#fff7ed' },
      },
    },
  },
  plugins: [],
};
export default config;
