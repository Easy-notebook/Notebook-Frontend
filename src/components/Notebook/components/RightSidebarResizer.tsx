// src/components/Notebook/components/RightSidebarResizer.tsx
// Right sidebar resizer component

interface RightSidebarResizerProps {
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export const RightSidebarResizer = ({ onMouseDown }: RightSidebarResizerProps) => {
  return (
    <div
      className="w-1 cursor-col-resize transition-all duration-150 relative group shrink-0 mr-2"
      onMouseDown={onMouseDown}
      style={{ touchAction: 'none' }}
    >
      <div className="absolute inset-y-0 w-1 rounded-full bg-transparent group-hover:bg-primary transition-all opacity-0 group-hover:opacity-100" />
    </div>
  );
};
