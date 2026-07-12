import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#faf9f7',
        border: '#e7e2da',
        ink: '#1c1917',
        muted: '#8a8378',
        status: {
          approved: '#3f6212',
          'approved-bg': '#dfead9',
          review: '#8a6d1a',
          'review-bg': '#fef3c7',
          rejected: '#8a1f1f',
          'rejected-bg': '#fde2e2',
          pending: '#8a8378',
          'pending-bg': '#f1efe9',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
      borderRadius: {
        DEFAULT: '4px',
      },
    },
  },
  plugins: [typography],
};
