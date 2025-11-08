// src/App.tsx
import { ConfigProvider, message } from 'antd';
import { useEffect } from 'react';
import AppRouter from './router/AppRouter';
import { getAntdTheme } from './theme/antdTheme';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';

// 配置全局 message 样式和位置
message.config({
  top: 24,
  duration: 3,
  maxCount: 3,
  prefixCls: 'custom-message',
});

function BackgroundLayers() {
  return (
    <>
      {/* Layer 1: Decorative background with gradient and colorful orbs */}
      <div className="fixed inset-0 -z-20 pointer-events-none overflow-hidden">
        {/* Base gradient background with enhanced depth */}
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-background/90" />

        {/* Colorful orbs with floating animation and enhanced effects */}
        {/* Primary green orb - top right */}
        <div
          className="absolute -top-24 -right-24 h-[500px] w-[500px] rounded-full dark:hidden"
          style={{
            background:
              'radial-gradient(circle at 30% 30%, rgba(65, 184, 131, 0.25), rgba(65, 184, 131, 0.12) 50%, transparent 70%)',
            filter: 'blur(60px)',
            animation: 'float-1 20s ease-in-out infinite, glow-pulse 8s ease-in-out infinite',
          }}
        />
        <div
          className="absolute -top-24 -right-24 h-[500px] w-[500px] rounded-full hidden dark:block"
          style={{
            background:
              'radial-gradient(circle at 30% 30%, rgba(82, 200, 150, 0.4), rgba(82, 200, 150, 0.2) 50%, transparent 70%)',
            filter: 'blur(60px)',
            animation: 'float-1 20s ease-in-out infinite, glow-pulse 8s ease-in-out infinite',
          }}
        />

        {/* Secondary green orb with glow */}
        <div
          className="absolute top-1/4 right-1/3 h-64 w-64 rounded-full dark:hidden"
          style={{
            background:
              'radial-gradient(circle at 40% 40%, rgba(34, 197, 94, 0.22), rgba(34, 197, 94, 0.1) 45%, transparent 65%)',
            filter: 'blur(50px)',
            animation:
              'float-2 18s ease-in-out infinite 2s, glow-pulse 10s ease-in-out infinite 1s',
          }}
        />
        <div
          className="absolute top-1/4 right-1/3 h-64 w-64 rounded-full hidden dark:block"
          style={{
            background:
              'radial-gradient(circle at 40% 40%, rgba(111, 217, 172, 0.35), rgba(111, 217, 172, 0.18) 45%, transparent 65%)',
            filter: 'blur(50px)',
            animation:
              'float-2 18s ease-in-out infinite 2s, glow-pulse 10s ease-in-out infinite 1s',
          }}
        />

        {/* Purple accent orb - bottom left */}
        <div
          className="absolute -bottom-32 -left-32 h-[450px] w-[450px] rounded-full dark:hidden"
          style={{
            background:
              'radial-gradient(circle at 35% 35%, rgba(101, 116, 205, 0.2), rgba(101, 116, 205, 0.1) 48%, transparent 68%)',
            filter: 'blur(65px)',
            animation:
              'float-3 22s ease-in-out infinite 4s, glow-pulse 12s ease-in-out infinite 2s',
          }}
        />
        <div
          className="absolute -bottom-32 -left-32 h-[450px] w-[450px] rounded-full hidden dark:block"
          style={{
            background:
              'radial-gradient(circle at 35% 35%, rgba(139, 149, 232, 0.38), rgba(139, 149, 232, 0.2) 48%, transparent 68%)',
            filter: 'blur(65px)',
            animation:
              'float-3 22s ease-in-out infinite 4s, glow-pulse 12s ease-in-out infinite 2s',
          }}
        />

        {/* Blue accent orb - bottom right */}
        <div
          className="absolute bottom-16 right-1/4 h-80 w-80 rounded-full dark:hidden"
          style={{
            background:
              'radial-gradient(circle at 45% 45%, rgba(52, 144, 220, 0.18), rgba(52, 144, 220, 0.08) 50%, transparent 70%)',
            filter: 'blur(55px)',
            animation:
              'float-4 25s ease-in-out infinite 6s, glow-pulse 15s ease-in-out infinite 3s',
          }}
        />
        <div
          className="absolute bottom-16 right-1/4 h-80 w-80 rounded-full hidden dark:block"
          style={{
            background:
              'radial-gradient(circle at 45% 45%, rgba(93, 173, 226, 0.32), rgba(93, 173, 226, 0.16) 50%, transparent 70%)',
            filter: 'blur(55px)',
            animation:
              'float-4 25s ease-in-out infinite 6s, glow-pulse 15s ease-in-out infinite 3s',
          }}
        />

        {/* Ambient light orb - center */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full dark:hidden"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(65, 184, 131, 0.15), rgba(52, 144, 220, 0.08) 40%, transparent 60%)',
            filter: 'blur(80px)',
            animation: 'float-5 30s ease-in-out infinite, glow-pulse 20s ease-in-out infinite 5s',
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full hidden dark:block"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(82, 200, 150, 0.28), rgba(93, 173, 226, 0.15) 40%, transparent 60%)',
            filter: 'blur(80px)',
            animation: 'float-5 30s ease-in-out infinite, glow-pulse 20s ease-in-out infinite 5s',
          }}
        />

        {/* Enhanced mesh gradient overlay with multi-directional gradients */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-green-500/10 dark:from-green-400/20 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-purple-500/8 dark:from-purple-400/18 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent dark:from-blue-400/8 via-transparent to-transparent" />

        {/* Subtle vignette effect */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_rgba(0,0,0,0.03)_100%)] dark:bg-[radial-gradient(ellipse_at_center,_transparent_0%,_rgba(0,0,0,0.1)_100%)]" />
      </div>

      {/* Layer 2: Global Acrylic effect with backdrop-filter (inspired by EasyPaper) */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {/* Light mode acrylic */}
        <div
          className="absolute inset-0 dark:hidden"
          style={{
            backgroundColor: 'rgba(var(--acrylic-tint), 0.7)',
            backdropFilter: 'blur(30px) saturate(180%)',
            WebkitBackdropFilter: 'blur(30px) saturate(180%)',
            transform: 'translateZ(0)',
          }}
        />

        {/* Dark mode acrylic - use CSS variable with higher transparency to show orbs */}
        <div
          className="absolute inset-0 hidden dark:block"
          style={{
            backgroundColor: 'rgba(var(--acrylic-tint), 0.7)',
            backdropFilter: 'blur(30px) saturate(180%)',
            WebkitBackdropFilter: 'blur(30px) saturate(180%)',
            transform: 'translateZ(0)',
          }}
        />

        {/* Enhanced noise texture for Acrylic material */}
        <div
          className="absolute inset-0 opacity-[0.06] dark:opacity-[0.08]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='4.5' numOctaves='6' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
            backgroundSize: '180px 180px',
            mixBlendMode: 'soft-light',
          }}
        />
      </div>
    </>
  );
}

function AppContent(): JSX.Element {
  const { resolvedTheme } = useTheme();
  const antdTheme = getAntdTheme(resolvedTheme === 'dark');

  useEffect(() => {
    // 添加自定义 message 样式
    const style = document.createElement('style');
    style.textContent = `
      /* 将 message 容器移到右上角 */
      .ant-message {
        top: 24px !important;
        right: 24px !important;
        left: auto !important;
        transform: none !important;
      }

      /* message 项样式 - glassmorphism 风格 */
      .ant-message-notice {
        position: relative;
        padding: 0;
        margin-bottom: 12px;
      }

      .ant-message-notice-content {
        position: relative;
        padding: 12px 20px;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06);
        backdrop-filter: blur(30px) saturate(180%);
        -webkit-backdrop-filter: blur(30px) saturate(180%);
        isolation: isolate;
        min-width: 280px;
      }

      /* 亮色模式 */
      .ant-message-notice-content {
        background: rgba(255, 255, 255, 0.85);
      }

      /* 暗色模式 */
      [data-theme="dark"] .ant-message-notice-content,
      .dark .ant-message-notice-content {
        background: rgba(var(--acrylic-tint), 0.7);
        border-color: rgba(255, 255, 255, 0.12);
      }

      /* 成功消息 */
      .ant-message-success .anticon {
        color: #52c896;
      }

      /* 错误消息 */
      .ant-message-error .anticon {
        color: #ef4444;
      }

      /* 警告消息 */
      .ant-message-warning .anticon {
        color: #f59e0b;
      }

      /* 信息消息 */
      .ant-message-info .anticon {
        color: #3b82f6;
      }

      /* 消息文本 */
      .ant-message-notice-content > span {
        color: #374151;
      }

      .dark .ant-message-notice-content > span {
        color: #e5e7eb;
      }

      /* 添加微妙的噪点纹理 */
      .ant-message-notice-content::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 16px;
        opacity: 0.06;
        pointer-events: none;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='4.2' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        background-size: 180px 180px;
        mix-blend-mode: soft-light;
      }

      .dark .ant-message-notice-content::before {
        opacity: 0.08;
      }

      /* 添加微妙的光泽效果 */
      .ant-message-notice-content::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 16px;
        opacity: 0.3;
        pointer-events: none;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0) 100%);
        mix-blend-mode: overlay;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <ConfigProvider theme={antdTheme}>
      <BackgroundLayers />
      <AppRouter />
    </ConfigProvider>
  );
}

function App(): JSX.Element {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
