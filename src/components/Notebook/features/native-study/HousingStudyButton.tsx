import { useState } from 'react';
import useNotebookStore from '@Store/notebookStore';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/UI/Dialog';
import { HousingStudyPanel } from './HousingStudyPanel';

export function HousingStudyButton() {
  const notebookId = useNotebookStore((state) => state.notebookId);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={!notebookId}
        onClick={() => setOpen(true)}
        className="rounded-lg px-3 py-1.5 text-sm text-primary bg-primary/10 disabled:opacity-50"
      >
        房屋研究
      </button>
      <Dialog open={open && !!notebookId} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogTitle>房屋特征分群与相似样本解释</DialogTitle>
          <DialogDescription>
            使用当前笔记的独立研究空间，保存测量结果与样本依据。
          </DialogDescription>
          {open && notebookId && <HousingStudyPanel key={notebookId} notebookId={notebookId} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
