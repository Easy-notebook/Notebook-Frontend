// src/components/ThemeToggle.tsx
import { useTheme } from '../contexts/ThemeContext';
import { Moon, Sun } from 'lucide-react';
import { useState, useEffect } from 'react';

interface ThemeToggleProps {
  collapsed?: boolean;
}

export function ThemeToggle({ collapsed = false }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  // If collapsed, show only a toggle button (single icon that switches between light/dark)
  if (collapsed) {
    const toggleTheme = () => {
      setTheme(theme === 'light' ? 'dark' : 'light');
    };

    return (
      <button
        onClick={toggleTheme}
        title={theme === 'light' ? 'Switch to Dark' : 'Switch to Light'}
        className={[
          'w-8 h-8',
          'relative rounded-lg',
          'flex items-center justify-center',
          'sidebar-item-hover',
          'text-theme-600 icon-glow-active',
          'transition-all duration-200',
        ].join(' ')}
      >
        {theme === 'light' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
    );
  }

  // Expanded state shows both buttons
  return (
    <div className="flex items-center gap-1 p-1 rounded-lg backdrop-blur-sm border border-gray-200 dark:border-gray-700">
      <button
        onClick={() => setTheme('light')}
        className={`p-2 rounded-md transition-all duration-200 ${
          theme === 'light'
            ? 'bg-white dark:bg-gray-700 shadow-sm text-theme-600'
            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
        }`}
        title="Light mode"
      >
        <Sun className="w-4 h-4" />
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={`p-2 rounded-md transition-all duration-200 ${
          theme === 'dark'
            ? 'bg-white dark:bg-gray-700 shadow-sm text-theme-600'
            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
        }`}
        title="Dark mode"
      >
        <Moon className="w-4 h-4" />
      </button>
    </div>
  );
}
