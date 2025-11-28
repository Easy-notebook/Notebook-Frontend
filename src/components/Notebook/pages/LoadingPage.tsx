import { useState, useEffect } from 'react';

// src/components/Notebook/pages/LoadingPage.tsx
// Loading page component

interface LoadingPageProps {
  embedded?: boolean;
}

export const LoadingPage = ({ embedded = false }: LoadingPageProps) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Only show splash screen if loading takes longer than 200ms
    // This prevents the splash screen from flashing on fast loads
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 200);

    return () => clearTimeout(timer);
  }, []);

  if (!isVisible) return null;

  return (
    <div
      className={`${
        embedded ? 'absolute' : 'fixed'
      } inset-0 z-50 flex flex-col items-center justify-center`}
    >
      {/* Acrylic Background */}
      <div
        className="absolute inset-0 bg-white/60 dark:bg-black/40 backdrop-blur-xl saturate-150"
        style={{
          WebkitBackdropFilter: 'blur(24px) saturate(150%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Logo with pulse effect */}
        <div className="relative">
          <div className="absolute inset-0 bg-theme-400/20 dark:bg-theme-400/10 rounded-full blur-xl animate-pulse" />
          <img src="/icon.svg" alt="Easy Notebook" className="relative w-24 h-24 drop-shadow-lg" />
        </div>
      </div>
    </div>
  );
};
