import { useEffect } from 'react';
import { notebookLog } from '@Utils/logger';
import { AutoSaveService } from './AutoSaveService';
import { AutoSavePageLifecycle } from './AutoSavePageLifecycle';

export function useAutoSavePageLifecycle(): void {
  useEffect(() => {
    const binding = new AutoSavePageLifecycle(
      AutoSaveService.getInstance(),
      document,
      window,
      (error) => notebookLog.error('Page lifecycle save failed; changes remain pending', { error })
    );
    return () => binding.dispose();
  }, []);
}
