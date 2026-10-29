import usePreviewStore from '@Store/previewStore';
export function openAgentDetails(notebookId: string, className: string) {
  usePreviewStore.getState().openAgentTab(notebookId, className);
}
