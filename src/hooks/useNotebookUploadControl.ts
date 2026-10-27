import { useLayoutEffect, useMemo } from 'react';
import { FileUploadControl } from '@Services/notebook/FileUploadControl';

/** Separate ownership for each notebook; layout cleanup runs before async publication. */
export function useNotebookUploadControl(notebookId: string | null): FileUploadControl {
  const control = useMemo(() => new FileUploadControl(notebookId), [notebookId]);
  useLayoutEffect(() => {
    control.attach();
    return () => control.detach();
  }, [control]);
  return control;
}
