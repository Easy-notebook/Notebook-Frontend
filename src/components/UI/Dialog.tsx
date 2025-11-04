import { useEffect, useRef, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  children: ReactNode;
}

const Dialog = ({ open, children }: DialogProps) => {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {children}
    </div>,
    document.body
  );
};

interface DialogContentProps {
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}

const DialogContent = ({ 
  children, 
  onClose,
  className = "" 
}: DialogContentProps) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (overlayRef.current && e.target instanceof Node && overlayRef.current === e.target) {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm"
    >
      <div className="min-h-full px-4 flex items-center justify-center">
        <div
          className={`relative w-full max-w-lg bg-white p-6 rounded-lg shadow-lg ${className}`}
        >
          {children}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-sm p-1 opacity-70 hover:opacity-100 hover:bg-theme-100"
          >
            <X className="h-4 w-4 text-theme-800" />
            <span className="sr-only">Close</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface BasicProps {
  className?: string;
  [key: string]: any;
}

const DialogHeader = ({ className = "", ...props }: BasicProps) => (
  <div
    className={`flex flex-col space-y-1.5 text-left border-b border-gray-200 pb-4 mb-4 ${className}`}
    {...props}
  />
);

const DialogTitle = ({ className = "", ...props }: BasicProps) => (
  <h3
    className={`text-lg font-semibold leading-none tracking-tight text-theme-800 ${className}`}
    {...props}
  />
);

const DialogDescription = ({ className = "", ...props }: BasicProps) => (
  <div
    className={`text-sm text-gray-600 ${className}`}
    {...props}
  />
);

const DialogFooter = ({ className = "", ...props }: BasicProps) => (
  <div
    className={`flex justify-end space-x-2 mt-6 ${className}`}
    {...props}
  />
);

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
};