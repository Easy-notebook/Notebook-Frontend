// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        // 全局主题色阶
        theme: {
          50:  '#F0FCF9',
          100: '#C6F7E9',
          200: '#8EEDD1',
          300: '#5FE3C0',
          400: '#2DCCA7',  // 轻盈主体色
          500: '#24B79F',
          600: '#1FA093',  // 稳重深色
          700: '#187D6D',
          800: '#0F5246',
          900: '#071E19',
        },
        'gray-50': '#F6F6F6',
      },
      backgroundImage: {
        // 渐变背景样式
        'theme-gradient-x': 'linear-gradient(to right, theme("colors.theme.600"), theme("colors.theme.400"), theme("colors.theme.200"))',
        'theme-gradient-y': 'linear-gradient(to bottom, theme("colors.theme.600"), theme("colors.theme.400"), theme("colors.theme.200"))',
      },
      keyframes: {
        // 渐变左右移动动画
        'gradient-x': {
          '0%, 100%': { 'background-position': '0% 50%' },
          '50%':      { 'background-position': '100% 50%' },
        },
      },
      animation: {
        // 无限循环的水平渐变动画
        'bg-gradient-x': 'gradient-x 8s ease infinite',
      },
      boxShadow: {
        // Apple 风格柔和阴影
        'theme-md': '0 4px 6px -1px rgba(31,160,147,0.1), 0 2px 4px -1px rgba(31,160,147,0.06)',
        'theme-lg': '0 10px 15px -3px rgba(31,160,147,0.1), 0 4px 6px -2px rgba(31,160,147,0.05)',
      },
      themeGradText: {
        'background-image': 'linear-gradient(to right, #41B883, #3490DC, #6574CD)',
        '-webkit-background-clip': 'text',
        'background-clip': 'text',
        'color': 'transparent',
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        /* 
          用法：<h1 class="theme-grad-text">Gradient Title</h1>
        */
        '.theme-grad-text': {
          'background-image': 'linear-gradient(to right, #41B883, #3490DC, #6574CD)',
          'color': 'transparent',
          '-webkit-background-clip': 'text',
          'background-clip': 'text',
        },
      })
    }
  ],
}
