import { useMemo, useEffect, useState } from 'react';
import { Cell as StoreCell } from '@Store/models';
import { MarkdownCellViewModel } from './MarkdownCellViewModel';

export const useMarkdownCellViewModel = (cell: StoreCell) => {
  const vm = useMemo(() => new MarkdownCellViewModel(cell), []);
  const [, setTick] = useState(0);

  useEffect(() => {
    vm.updateProps(cell);
  }, [cell, vm]);

  useEffect(() => {
    const unsubscribe = vm.subscribe(() => {
      setTick((t) => t + 1);
    });
    return unsubscribe;
  }, [vm]);

  return vm;
};
