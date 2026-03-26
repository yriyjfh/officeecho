/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./visitor.html",
    "./admin.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 温和的蓝青色系
        primary: {
          50: '#e6f7ff',
          100: '#bae7ff',
          200: '#91d5ff',
          300: '#69c0ff',
          400: '#40a9ff',
          500: '#1890ff',
          600: '#096dd9',
          700: '#0050b3',
          800: '#003a8c',
          900: '#002766',
        },
        // 警示色三级
        warning: {
          light: '#ffe58f', // 黄
          medium: '#ffa940', // 橙
          high: '#ff4d4f', // 红
        }
      },
      fontSize: {
        // 屏幕端大字体
        'elderly-base': '22px',
        'elderly-lg': '28px',
        'elderly-xl': '32px',
        'elderly-2xl': '40px',
      },
      spacing: {
        // 触控友好尺寸
        'touch': '48px',
        'touch-lg': '64px',
      },
      lineHeight: {
        'relaxed-plus': '1.8',
      }
    },
  },
  plugins: [],
}
