// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      height: {
        dvh: '100dvh', // 动态视口高度支持
      },
      colors: {
        // 全局主题色阶
        theme: {
          50: '#F0FCF9',
          100: '#C6F7E9',
          200: '#8EEDD1',
          300: '#5FE3C0',
          400: '#2DCCA7', // 轻盈主体色
          500: '#24B79F',
          600: '#1FA093', // 稳重深色
          700: '#187D6D',
          800: '#0F5246',
          900: '#071E19',
        },
        'gray-50': '#F6F6F6',
        // Fluent Design System colors from CSS variables
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'var(--color-primary)',
          light: 'var(--color-primary-light)',
          dark: 'var(--color-primary-dark)',
        },
        secondary: 'var(--color-secondary)',
        accent: 'var(--color-accent)',
        success: '#22c55e', // green-500
        warning: '#f59e0b', // amber-500
        neutral: {
          DEFAULT: 'var(--color-neutral)',
          dark: 'var(--color-neutral-dark)',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(ellipse at top, var(--tw-gradient-stops))',
        // 渐变背景样式
        'theme-gradient-x':
          'linear-gradient(to right, theme("colors.theme.600"), theme("colors.theme.400"), theme("colors.theme.200"))',
        'theme-gradient-y':
          'linear-gradient(to bottom, theme("colors.theme.600"), theme("colors.theme.400"), theme("colors.theme.200"))',
      },
      keyframes: {
        // 渐变左右移动动画
        'gradient-x': {
          '0%, 100%': { 'background-position': '0% 50%' },
          '50%': { 'background-position': '100% 50%' },
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
        color: 'transparent',
      },
    },
  },
  plugins: [
    function ({ addUtilities, addVariant }) {
      // 添加 light: 变体，用于明确指定只在 light mode 下生效的样式
      // 说明：主题切换逻辑会在 <html> 元素上添加 `light` 或 `dark` 类名
      // 使用 `html.light &` 可以确保仅当根元素为 light 时才生效，避免 `:not(.dark)`
      // 在深色模式仍被匹配到（因为任意非 .dark 祖先都会命中）的问题。
      addVariant('light', 'html.light &');

      addUtilities({
        /*
          用法：<h1 class="theme-grad-text">Gradient Title</h1>
        */
        '.theme-grad-text': {
          'background-image': 'linear-gradient(to right, #41B883, #3490DC, #6574CD)',
          color: 'transparent',
          '-webkit-background-clip': 'text',
          'background-clip': 'text',
        },
      });
    },
  ],
};
