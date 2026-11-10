import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // WCAG AAA-safe palette: worst-case contrast >= 7:1 (normal text).
        bg: '#0b0b12', // near-black background
        surface: '#16161f',
        surfaceAlt: '#1e1e2b',
        onSurface: '#f4f4fb', // text on bg/surface
        onSurfaceDim: '#b9b9cc', // secondary text (>=7:1 on bg)
        primary: '#7de3ff', // interactive accents on dark bg
        onPrimary: '#001217',
        primaryHover: '#b0edff',
        danger: '#ff8fa3',
        onDanger: '#2a0008',
        focus: '#ffd54a', // 1:1 visible focus ring (>=3:1 against both)
        border: '#3a3a4e',
      },
      fontSize: {
        // Minimum 18px base to support AAA readability
        base: ['1.125rem', { lineHeight: '1.75' }],
      },
      spacing: { 18: '4.5rem', 22: '5.5rem' },
      boxShadow: {
        focusRing: '0 0 0 3px #0b0b12, 0 0 0 5px #ffd54a',
      },
    },
  },
  plugins: [],
};
export default config;
