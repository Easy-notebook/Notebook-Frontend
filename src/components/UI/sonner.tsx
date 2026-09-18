import { useTheme } from '@/contexts/ThemeContext';
import { Toaster as Sonner, ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme as ToasterProps['theme']}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-transparent group-[.toaster]:text-foreground group-[.toaster]:border-none group-[.toaster]:shadow-none',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
        style: {
          background: 'transparent',
          border: 'none',
          boxShadow: 'none',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
