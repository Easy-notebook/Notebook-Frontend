// src/App.tsx
import { ConfigProvider } from 'antd';
import AppRouter from './router/AppRouter';
import { getAntdTheme } from './theme/antdTheme';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';

function BackgroundLayers() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      {/* Base gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900" />

      {/* Colorful orbs */}
      <div
        className="absolute top-20 right-32 h-96 w-96 rounded-full blur-3xl animate-pulse"
        style={{
          animationDuration: '8s',
          background: 'radial-gradient(circle, rgba(65, 184, 131, 0.12), transparent 70%)',
        }}
      />
      <div
        className="absolute bottom-32 left-20 h-80 w-80 rounded-full blur-3xl animate-pulse"
        style={{
          animationDuration: '10s',
          animationDelay: '2s',
          background: 'radial-gradient(circle, rgba(101, 116, 205, 0.1), transparent 70%)',
        }}
      />
      <div
        className="absolute top-1/2 right-1/4 h-72 w-72 rounded-full blur-3xl animate-pulse"
        style={{
          animationDuration: '12s',
          animationDelay: '4s',
          background: 'radial-gradient(circle, rgba(34, 197, 94, 0.08), transparent 70%)',
        }}
      />

      {/* Do not add a global acrylic veil here.
          The Mica/Acrylic effect should be applied on surfaces
          (panels/cards) so that only UI chrome is frosted, not the whole app. */}

      {/* Noise texture */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='4.2' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
          backgroundSize: '200px 200px',
          mixBlendMode: 'soft-light',
        }}
      />
    </div>
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
