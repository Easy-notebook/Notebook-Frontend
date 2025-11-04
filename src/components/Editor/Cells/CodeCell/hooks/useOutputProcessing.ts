import { useState, useEffect, useMemo } from 'react';
import { Output, Cell } from '../utils/types';
import { processOutput } from '../utils/outputProcessing';

/**
 * Hook to process and manage cell outputs
 */
export const useOutputProcessing = (cell: Cell, isExecuting: boolean, dslcMode: boolean) => {
  const [outputUpdateKey, setOutputUpdateKey] = useState(0);
  const [outputVisible, setOutputVisible] = useState(false);

  // Process outputs
  const processedOutputs = useMemo(() => {
    if (cell.outputs && Array.isArray(cell.outputs)) {
      return cell.outputs
        .map(processOutput)
        .filter((o): o is Output => o !== null)
        .map((output) => ({
          ...output,
          key: output.key || `output-${Date.now()}-${Math.random()}`,
        }));
    }
    return [];
  }, [cell.outputs]);

  // Monitor output changes during execution
  useEffect(() => {
    if (isExecuting) {
      const interval = setInterval(() => {
        setOutputUpdateKey((prev) => prev + 1);
      }, 100);

      return () => clearInterval(interval);
    }
  }, [isExecuting]);

  // Control output visibility animation
  useEffect(() => {
    if (processedOutputs.length > 0) {
      setOutputVisible(true);
    } else {
      setOutputVisible(false);
    }
  }, [processedOutputs.length]);

  // DSLC mode debug logging
  useEffect(() => {
    if (dslcMode && processedOutputs.length > 0 && import.meta.env.DEV) {
      console.log('DSLC mode output:', cell.id, processedOutputs);
    }
  }, [dslcMode, processedOutputs, cell.id]);

  return {
    processedOutputs,
    outputVisible,
    outputUpdateKey,
  };
};
