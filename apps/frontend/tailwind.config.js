/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        space: { 950: '#05060d', 900: '#0b1020', 800: '#141e3c' },
        neon: { cyan: '#22d3ee', violet: '#6366f1', magenta: '#e879f9' },
      },
      boxShadow: {
        glow: '0 0 24px rgba(40,120,255,0.15)',
        'glow-cyan': '0 0 16px rgba(34,211,238,0.35)',
      },
      backgroundImage: {
        'space-radial': 'radial-gradient(120% 120% at 0% 0%, #0b1020 0%, #05060d 60%)',
      },
      fontFamily: { mono: ['ui-monospace', 'Menlo', 'monospace'] },
    },
  },
  plugins: [],
};
