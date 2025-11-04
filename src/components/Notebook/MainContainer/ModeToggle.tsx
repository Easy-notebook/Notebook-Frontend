import { useState, useEffect, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

const VUE_PRIMARY = '#41B883';
const VUE_SECONDARY = '#35495E';

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

  const selectedMode = modes.find(mode => mode.id === viewMode);

  // 更新按钮位置
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setButtonRect(rect);
    }
  }, [isOpen]);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        // 检查点击的是否是下拉菜单内的元素
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
        className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50"
        style={{
          whiteSpace: 'nowrap',
        }}
      >
        <span
          style={{
            font: '18px ui-sans-serif, -apple-system, system-ui',
            fontWeight: 600,
            height: '24px',
            letterSpacing: 'normal',
            lineHeight: '28px',
            overflowClipMargin: 'content-box',
            whiteSpace: 'nowrap', 
            display: 'inline-block',
            verticalAlign: 'middle', 
          }}
          className="theme-grad-text"
        >
          {selectedMode?.name}
        </span>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
          className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          <path fillRule="evenodd" clipRule="evenodd"
            d="M5.29289 9.29289C5.68342 8.90237 6.31658 8.90237 6.70711 9.29289L12 14.5858L17.2929 9.29289C17.6834 8.90237 18.3166 8.90237 18.7071 9.29289C19.0976 9.68342 19.0976 10.3166 18.7071 10.7071L12.7071 16.7071C12.5196 16.8946 12.2652 17 12 17C11.7348 17 11.4804 16.8946 11.2929 16.7071L5.29289 10.7071C4.90237 10.3166 4.90237 9.68342 5.29289 9.29289Z"
            fill="currentColor" />
        </svg>
      </button>

      {isOpen && buttonRect && createPortal(
        <div 
          data-dropdown-menu
          className="bg-white rounded-lg shadow-lg border border-gray-200"
          style={{ 
            position: 'fixed',
            top: buttonRect.bottom + 4,
            left: buttonRect.left,
            width: buttonRect.width,
            zIndex: 999999,
            minWidth: '200px'
          }}
        >
          {modes.map(mode => (
            <button
              key={mode.id}
              onClick={() => { onModeChange(mode.id); setIsOpen(false); }}
              className={`w-full text-left p-3 flex items-center justify-between transition-colors ${viewMode === mode.id ? 'bg-white/90' : 'hover:bg-white/80'}`}
              style={{ 
                whiteSpace: 'nowrap'
              }}
            >
              <span
                className="text-lg font-medium"
                style={{
                  color: viewMode === mode.id ? VUE_PRIMARY : VUE_SECONDARY,
                }}
              >
                {mode.name}
              </span>
              {viewMode === mode.id && <span style={{ color: VUE_PRIMARY, marginLeft: 8 }}>✓</span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
});

export default ModeToggle;