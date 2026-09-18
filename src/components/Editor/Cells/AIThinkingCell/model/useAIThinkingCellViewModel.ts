import { useState, useEffect, useMemo } from 'react';
import { Cell as StoreCell } from '@Store/models';
import { AIThinkingCellViewModel } from './AIThinkingCellViewModel';

export const useAIThinkingCellViewModel = (cell: StoreCell) => {
  const vm = useMemo(() => new AIThinkingCellViewModel(cell), []);

  // Force re-render when VM notifies
  const [, setTick] = useState(0);

  useEffect(() => {
    vm.updateProps(cell);
  }, [cell, vm]);

  useEffect(() => {
    const unsubscribe = vm.subscribe(() => {
      setTick((t) => t + 1);
    });
    return () => {
      unsubscribe();
      vm.dispose();
    };
  }, [vm]);

  return vm;
};
