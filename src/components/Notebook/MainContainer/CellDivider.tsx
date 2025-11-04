import { useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { PlusCircle, Sparkles } from 'lucide-react';

const VUE_SECONDARY = '#35495E';

interface CellDividerProps {
  index: number;
  onAddCell: (type: string, index: number) => void;
  viewMode: string;
}

const CellDivider = memo<CellDividerProps>(({ index, onAddCell, viewMode }) => {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="h-2 group relative my-2 w-full max-w-screen-xl mx-auto"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isHovered && (viewMode === 'complete' || viewMode === 'create') && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 bg-white/80 backdrop-blur-md shadow-lg rounded-2xl p-2 z-10">
          <button
            onClick={() => onAddCell('code', index)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm" style={{ color: VUE_SECONDARY }}
          >
            <PlusCircle size={16} />
            {t('cell.addCodeCell')}
          </button>
          <button
            onClick={() => onAddCell('markdown', index)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm" style={{ color: VUE_SECONDARY }}
          >
            <PlusCircle size={16} />
            {t('cell.addTextCell')}
          </button>
          <button
            onClick={() => onAddCell('image', index)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm" style={{ color: VUE_SECONDARY }}
          >
            <PlusCircle size={16} />
            图片
          </button>
          <button
            onClick={() => onAddCell('file', index)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm" style={{ color: VUE_SECONDARY }}
          >
            <Sparkles size={16} />
            {t('cell.aiGenerate')}
          </button>
        </div>
      )}
    </div>
  );
});

export default CellDivider;