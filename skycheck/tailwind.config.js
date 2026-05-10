/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#1A56C4',
          700: '#1d4ed8',
          800: '#0D2F6E',
          900: '#1e3a8a',
        },
        risk: {
          high:   '#EF4444',
          medium: '#F59E0B',
          low:    '#22C55E',
          unknown:'#6B7280',
        },
        offline: '#F97316',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      animation: {
        shimmer: 'shimmer 1.5s infinite',
        fadeIn:  'fadeIn 0.3s ease-out',
        slideUp: 'slideUp 0.3s ease-out',
        pulse:   'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
      },
      maxWidth: { mobile: '430px' },
      backgroundImage: {
        'sky-gradient': 'linear-gradient(180deg, #1A56C4 0%, #0D2F6E 100%)',
      },
      boxShadow: {
        card: '0 2px 12px 0 rgba(0,0,0,0.08)',
        'card-lg': '0 4px 20px 0 rgba(0,0,0,0.12)',
      },
    },
  },
  plugins: [],
}
