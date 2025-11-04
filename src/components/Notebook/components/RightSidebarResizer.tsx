// src/components/Notebook/components/RightSidebarResizer.tsx
// Right sidebar resizer component

interface RightSidebarResizerProps {
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export const RightSidebarResizer = ({ onMouseDown }: RightSidebarResizerProps) => {
  return (
    <div
      className="w-px bg-gray-300 hover:bg-theme-500 cursor-col-resize transition-colors duration-150 relative group"
      onMouseDown={onMouseDown}
    >
      <div className="absolute inset-y-0 w-1 -translate-x-0.5 group-hover:bg-theme-100/50" />
    </div>
  );
};
