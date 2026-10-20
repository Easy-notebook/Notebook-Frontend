import { Play, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useCodeStore from '@Store/codeStore';

/** Batch stop waits for the current cell; it never pretends to cancel native server work. */
export function RunAllButton({
  onRunAll,
  isExecuting,
  empty,
}: {
  onRunAll: () => void;
  isExecuting: boolean;
  empty: boolean;
}) {
  const { t } = useTranslation();
  const phase = useCodeStore((state) => state.batchExecution);
  const stop = useCodeStore((state) => state.stopBatchExecution);
  const active = phase !== 'idle';
  return (
    <button
      onClick={active ? stop : onRunAll}
      disabled={empty || phase === 'stopping' || (isExecuting && !active)}
      title={active ? t('fileOperations.stopRunAllHint') : t('fileOperations.runAll')}
      className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed bg-primary/10 text-primary hover:bg-primary/20 hover:shadow-md hover:shadow-primary/20"
    >
      {active ? <Square size={16} /> : <Play size={16} />}
      <span className="hidden sm:inline">
        {t(
          phase === 'stopping'
            ? 'fileOperations.stoppingRunAll'
            : active
              ? 'fileOperations.stopRunAll'
              : isExecuting
                ? 'fileOperations.running'
                : 'fileOperations.runAll'
        )}
      </span>
    </button>
  );
}
