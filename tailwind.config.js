/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    // Add Relume UI content path
    "./node_modules/@relume_io/relume-ui/dist/**/*.{js,ts,jsx,tsx}"
  ],
  presets: [require("@relume_io/relume-tailwind")],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
      },
      colors: {
        primary: {
          400: '#3B82F6',
          500: '#1F6FEB',
          600: '#1D4ED8',
          DEFAULT: '#1F6FEB',
          dark: '#0969DA',
          light: '#4285F4'
        },
        dark: {
          700: '#2E3440',
          800: '#1F242D',
          900: '#0F141C',
          950: '#090C12'
        },
        accent: {
          DEFAULT: '#FF7A00',
          dark: '#E85D00',
          light: '#FF9533'
        },
        text: {
          primary: '#0F172A',
          secondary: '#64748B',
          light: '#94A3B8'
        }
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '2rem',
      }
    },
  },
  plugins: [],
}
