/**
 * @file packages/dashboard/tailwind.config.js
 * @description Tailwind CSS configuration file for GateForge Dashboard.
 * Configured with Geist + Geist Mono font families, warm stone neutrals,
 * Tremor v3 dark mode tokens mapped to warm stone and Persimmon Orange accent (#F97316).
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './node_modules/@tremor/react/**/*.{js,ts,jsx,tsx}',
    '../../node_modules/@tremor/react/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    transparent: 'transparent',
    current: 'currentColor',
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      colors: {
        // Persimmon orange brand tokens
        persimmon: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407',
        },
        // Tremor dark mode tokens with warm stone & persimmon accents
        'dark-tremor': {
          brand: {
            faint: '#291407',
            muted: '#431407',
            subtle: '#c2410c',
            DEFAULT: '#f97316',
            emphasis: '#fb923c',
            inverted: '#0c0a09',
          },
          background: {
            muted: '#1c1917',
            subtle: '#141210',
            DEFAULT: '#1c1917',
            emphasis: '#292524',
          },
          border: {
            DEFAULT: '#292524',
          },
          ring: {
            DEFAULT: '#292524',
          },
          content: {
            subtle: '#78716c',
            DEFAULT: '#a8a29e',
            emphasis: '#e7e5e4',
            strong: '#fafaf9',
            inverted: '#000000',
          },
        },
        // Tremor standard tokens mapped to dark stone palette
        tremor: {
          brand: {
            faint: '#291407',
            muted: '#431407',
            subtle: '#c2410c',
            DEFAULT: '#f97316',
            emphasis: '#fb923c',
            inverted: '#0c0a09',
          },
          background: {
            muted: '#1c1917',
            subtle: '#141210',
            DEFAULT: '#1c1917',
            emphasis: '#292524',
          },
          border: {
            DEFAULT: '#292524',
          },
          ring: {
            DEFAULT: '#292524',
          },
          content: {
            subtle: '#78716c',
            DEFAULT: '#a8a29e',
            emphasis: '#e7e5e4',
            strong: '#fafaf9',
            inverted: '#000000',
          },
        },
      },
      boxShadow: {
        'dark-tremor-input': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'dark-tremor-card': '0 1px 3px 0 rgb(0 0 0 / 0.2), 0 1px 2px -1px rgb(0 0 0 / 0.2)',
        'dark-tremor-dropdown': '0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3)',
      },
      borderRadius: {
        'tremor-small': '0.5rem',
        'tremor-default': '0.75rem',
        'tremor-full': '9999px',
      },
      fontSize: {
        'tremor-label': ['0.75rem', { lineHeight: '1rem' }],
        'tremor-default': ['0.875rem', { lineHeight: '1.25rem' }],
        'tremor-title': ['1.125rem', { lineHeight: '1.75rem' }],
        'tremor-metric': ['1.875rem', { lineHeight: '2.25rem' }],
      },
    },
  },
  safelist: [
    {
      pattern:
        /^(bg-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|persimmon)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
      variants: ['hover', 'ui-selected'],
    },
    {
      pattern:
        /^(text-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|persimmon)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
      variants: ['hover', 'ui-selected'],
    },
    {
      pattern:
        /^(border-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|persimmon)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
      variants: ['hover', 'ui-selected'],
    },
    {
      pattern:
        /^(ring-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|persimmon)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
    {
      pattern:
        /^(stroke-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|persimmon)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
    {
      pattern:
        /^(fill-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|persimmon)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
  ],
  plugins: [],
};
