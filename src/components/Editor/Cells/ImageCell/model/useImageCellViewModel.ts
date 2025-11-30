import { useState, useEffect, useMemo, useRef } from 'react';
import { Cell as StoreCell } from '@Store/models';
import { ImageCellViewModel } from './ImageCellViewModel';

export const useImageCellViewModel = (cell: StoreCell) => {
  const vm = useMemo(() => new ImageCellViewModel(cell), []);
  const inputRef = useRef<HTMLInputElement>(null);

  // Force re-render when VM notifies
  const [, setTick] = useState(0);

  useEffect(() => {
    vm.setInputRef(inputRef);
  }, [vm]);

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

  return { vm, inputRef };
};
