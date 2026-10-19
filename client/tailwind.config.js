/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Small, consistent radii. Nothing bubbly.
    borderRadius: {
      none: '0',
      sm: '2px',
      DEFAULT: '3px',
      md: '4px',
      lg: '6px',
      full: '9999px',
    },
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        raised: token('raised'),
        line: token('line'),
        'line-strong': token('line-strong'),
        ink: token('ink'),
        'ink-muted': token('ink-muted'),
        'ink-faint': token('ink-faint'),
        accent: token('accent'),
        'accent-strong': token('accent-strong'),
        'accent-ink': token('accent-ink'),
        ok: token('ok'),
        warn: token('warn'),
        bad: token('bad'),
        'chart-1': token('chart-1'),
        'chart-2': token('chart-2'),
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        serif: ['"Source Serif 4 Variable"', 'Georgia', 'Cambria', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      maxWidth: {
        prose: '68ch',
      },
      transitionDuration: {
        DEFAULT: '120ms',
      },
    },
  },
  plugins: [],
};
