// src/App.tsx
import { ConfigProvider } from 'antd';
import AppRouter from './router/AppRouter';
import { getAntdTheme } from './theme/antdTheme';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';

function BackgroundLayers() {
  return (
    <>
      {/* Layer 1: Decorative background with gradient and colorful orbs */}
      <div className="fixed inset-0 -z-20 pointer-events-none overflow-hidden">
        {/* Base gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-background/95" />

        {/* Colorful orbs - provide content for backdrop-filter effect */}
        <div
          className="absolute top-20 right-32 h-96 w-96 rounded-full blur-3xl animate-pulse"
          style={{
            animationDuration: '8s',
            background: 'radial-gradient(circle, rgba(65, 184, 131, 0.15), transparent 70%)',
          }}
        />
        <div
          className="absolute bottom-32 left-20 h-80 w-80 rounded-full blur-3xl animate-pulse"
          style={{
            animationDuration: '10s',
            animationDelay: '2s',
            background: 'radial-gradient(circle, rgba(101, 116, 205, 0.12), transparent 70%)',
          }}
        />
        <div
          className="absolute top-1/2 right-1/4 h-72 w-72 rounded-full blur-3xl animate-pulse"
          style={{
            animationDuration: '12s',
            animationDelay: '4s',
            background: 'radial-gradient(circle, rgba(34, 197, 94, 0.1), transparent 70%)',
          }}
        />
        <div
          className="absolute bottom-10 right-10 h-64 w-64 rounded-full blur-3xl animate-pulse"
          style={{
            animationDuration: '15s',
            animationDelay: '6s',
            background: 'radial-gradient(circle, rgba(52, 144, 220, 0.08), transparent 70%)',
          }}
        />

        {/* Mesh gradient overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-green-500/8 dark:from-green-400/10 via-transparent to-transparent" />
      </div>

      {/* Layer 2: Global Acrylic effect with backdrop-filter (inspired by EasyPaper) */}
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          backgroundColor: 'rgba(var(--acrylic-tint), 0.7)',
          backdropFilter: 'blur(30px) saturate(180%)',
          WebkitBackdropFilter: 'blur(30px) saturate(180%)',
        }}
      >
        {/* Noise texture for Acrylic material */}
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='4.2' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
            backgroundSize: '200px 200px',
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
