/**
 * @file packages/dashboard/tailwind.config.js
 * @description Tailwind CSS configuration file for GateForge Dashboard.
 * Defines theme extensions, Tremor v3 dark mode color tokens, and content search paths
 * so Tremor primitives (Card, Metric, AreaChart, BarChart, Table) render with optimal styling.
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
      colors: {
        // Tremor dark mode tokens
        'dark-tremor': {
          brand: {
            faint: '#0b1329',
            muted: '#1e293b',
            subtle: '#2563eb',
            DEFAULT: '#38bdf8',
            emphasis: '#60a5fa',
            inverted: '#020617',
          },
          background: {
            muted: '#090d16',
            subtle: '#0f172a',
            DEFAULT: '#0b0f19',
            emphasis: '#1e293b',
          },
          border: {
            DEFAULT: '#1e293b',
          },
          ring: {
            DEFAULT: '#1e293b',
          },
          content: {
            subtle: '#64748b',
            DEFAULT: '#94a3b8',
            emphasis: '#e2e8f0',
            strong: '#f8fafc',
            inverted: '#000000',
          },
        },
        // Tremor standard tokens (mapped to dark palette for default dark developer experience)
        tremor: {
          brand: {
            faint: '#0b1329',
            muted: '#1e293b',
            subtle: '#2563eb',
            DEFAULT: '#38bdf8',
            emphasis: '#60a5fa',
            inverted: '#020617',
          },
          background: {
            muted: '#090d16',
            subtle: '#0f172a',
            DEFAULT: '#0b0f19',
            emphasis: '#1e293b',
          },
          border: {
            DEFAULT: '#1e293b',
          },
          ring: {
            DEFAULT: '#1e293b',
          },
          content: {
            subtle: '#64748b',
            DEFAULT: '#94a3b8',
            emphasis: '#e2e8f0',
            strong: '#f8fafc',
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
        'tremor-small': '0.375rem',
        'tremor-default': '0.5rem',
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
        /^(bg-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
      variants: ['hover', 'ui-selected'],
    },
    {
      pattern:
        /^(text-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
      variants: ['hover', 'ui-selected'],
    },
    {
      pattern:
        /^(border-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
      variants: ['hover', 'ui-selected'],
    },
    {
      pattern:
        /^(ring-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
    {
      pattern:
        /^(stroke-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
    {
      pattern:
        /^(fill-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
  ],
  plugins: [],
};
