import { useState, useEffect, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

interface ModeToggleProps {
  viewMode: string;
  onModeChange: (mode: string) => void;
}

const ModeToggle = memo<ModeToggleProps>(({ viewMode, onModeChange }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);

  const modes = [
    { id: 'create', label: 'Create Mode', name: t('modeToggle.createMode', '创建模式') },
    { id: 'demo', label: 'Demo Mode', name: t('modeToggle.demoMode', '演示模式') },
  ];

  const selectedMode = modes.find((mode) => mode.id === viewMode);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setButtonRect(rect);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        const dropdown = document.querySelector('[data-dropdown-menu]');
        if (!dropdown || !dropdown.contains(event.target as Node)) {
          setIsOpen(false);
        }
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="relative w-full max-w-md">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        style={{ whiteSpace: 'nowrap' }}
      >
        <span
          className="theme-grad-text"
          style={{
            font: '18px ui-sans-serif, -apple-system, system-ui',
            fontWeight: 600,
            height: '24px',
            lineHeight: '28px',
            display: 'inline-block',
            verticalAlign: 'middle',
          }}
        >
          {selectedMode?.name}
        </span>
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`text-gray-500 dark:text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M5.29289 9.29289C5.68342 8.90237 6.31658 8.90237 6.70711 9.29289L12 14.5858L17.2929 9.29289C17.6834 8.90237 18.3166 8.90237 18.7071 9.29289C19.0976 9.68342 19.0976 10.3166 18.7071 10.7071L12.7071 16.7071C12.5196 16.8946 12.2652 17 12 17C11.7348 17 11.4804 16.8946 11.2929 16.7071L5.29289 10.7071C4.90237 10.3166 4.90237 9.68342 5.29289 9.29289Z"
            fill="currentColor"
          />
        </svg>
      </button>

      {isOpen &&
        buttonRect &&
        createPortal(
          <div
            data-dropdown-menu
            className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700"
            style={{
              position: 'fixed',
              top: buttonRect.bottom + 4,
              left: buttonRect.left,
              width: buttonRect.width,
              zIndex: 999999,
              minWidth: '200px',
            }}
          >
            {modes.map((mode) => (
              <button
                key={mode.id}
                onClick={() => {
                  onModeChange(mode.id);
                  setIsOpen(false);
                }}
                className={`w-full text-left p-3 flex items-center justify-between transition-colors ${viewMode === mode.id ? 'bg-gray-50 dark:bg-gray-700/50' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}
                style={{ whiteSpace: 'nowrap' }}
              >
                <span className="text-gray-800 dark:text-gray-200">{mode.name}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
});

export default ModeToggle;
