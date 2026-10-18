import { Alert, Button, Input, List, Modal, Space, Typography } from 'antd';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { saveAs } from 'file-saver';
import { usePersistence } from '../../../services/persistence/PersistenceContext';
import type { NotebookRecoveryRecord } from '../../../services/persistence/interfaces';
import { NotebookRecoveryController } from '../../../services/recovery/NotebookRecoveryController';
import { AutoSaveService } from '../../../services/autoSave/AutoSaveService';

function titleOf(draft: NotebookRecoveryRecord): string {
  try {
    const content: unknown = JSON.parse(draft.content);
    if (
      content &&
      typeof content === 'object' &&
      'title' in content &&
      typeof content.title === 'string' &&
      content.title.trim()
    )
      return content.title;
  } catch {
    /* Raw content remains downloadable even if its structure cannot be previewed. */
  }
  return `Notebook ${draft.notebookId.slice(0, 8)}`;
}

/** Recovery actions never overwrite the active document or acknowledge its pending edits. */
export function NotebookRecoveryCenter() {
  const { recovery } = usePersistence();
  const controller = useMemo(() => new NotebookRecoveryController(recovery), [recovery]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [open, setOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<NotebookRecoveryRecord | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [saveFailures, setSaveFailures] = useState<Record<string, string>>({});
  const preview = state.drafts.find((draft) => draft.id === previewId);
  const busy = state.phase === 'deleting';

  useEffect(() => {
    const refresh = () => {
      void controller.refresh();
    };
    refresh();
    const unsubscribe = AutoSaveService.getInstance().subscribe((event) => {
      const id = event.notebookId;
      if (event.type === 'save_failed') {
        if (id)
          setSaveFailures((previous) => ({
            ...previous,
            [id]: event.error ?? 'Your latest edits could not be saved.',
          }));
        refresh();
      } else if (id && event.type === 'save_completed') {
        setSaveFailures((previous) => {
          const remaining = { ...previous };
          delete remaining[id];
          return remaining;
        });
      }
    });
    window.addEventListener('focus', refresh);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', refresh);
    };
  }, [controller]);

  const download = (draft: NotebookRecoveryRecord) => {
    setDownloadError(null);
    try {
      const safeName = draft.notebookId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
      saveAs(
        new Blob([draft.content], { type: 'application/json;charset=utf-8' }),
        `recovery-${safeName}-${draft.revision}.json`
      );
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
      {(state.drafts.length > 0 || state.error || Object.keys(saveFailures).length > 0) && (
        <Button
          style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 900 }}
          onClick={() => {
            setOpen(true);
            void controller.refresh();
          }}
        >
          {state.drafts.length > 0 || state.error
            ? `Recovery copies (${state.drafts.length})`
            : 'Unsaved edits'}
        </Button>
      )}
      <Modal
        title="Recovery copies"
        open={open}
        onCancel={() => setOpen(false)}
        width={720}
        footer={
          <Space>
            <Button
              disabled={busy}
              loading={state.phase === 'loading'}
              onClick={() => void controller.refresh()}
            >
              Refresh
            </Button>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </Space>
        }
      >
        <Typography.Paragraph>
          These local copies contain edits that could not replace the saved notebook. Download a
          copy to keep its contents. Your current notebook stays unchanged.
        </Typography.Paragraph>
        {(state.error || downloadError) && (
          <Alert type="error" showIcon message={state.error ?? downloadError} />
        )}
        {Object.entries(saveFailures).map(([id, error]) => (
          <Alert
            key={id}
            type="error"
            showIcon
            message="Some edits are still unsaved"
            description={error}
          />
        ))}
        {state.notice && <Alert type="info" showIcon message={state.notice} />}
        <List
          loading={state.phase === 'loading'}
          dataSource={[...state.drafts]}
          locale={{
            emptyText: state.error ? 'Unable to read recovery copies.' : 'No recovery copies.',
          }}
          renderItem={(draft) => (
            <List.Item key={draft.id}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Typography.Text strong>{titleOf(draft)}</Typography.Text>
                <Typography.Text type="secondary">
                  {new Date(draft.updatedAt).toLocaleString()}
                </Typography.Text>
                <Space wrap>
                  <Button onClick={() => setPreviewId(previewId === draft.id ? null : draft.id)}>
                    View contents
                  </Button>
                  <Button onClick={() => download(draft)}>Download JSON</Button>
                  <Button danger disabled={busy} onClick={() => setPendingDeletion(draft)}>
                    Delete recovery copy
                  </Button>
                </Space>
                {preview?.id === draft.id && (
                  <Input.TextArea
                    aria-label="Recovery contents"
                    readOnly
                    value={draft.content}
                    rows={10}
                    style={{ width: '100%', fontFamily: 'monospace' }}
                  />
                )}
              </Space>
            </List.Item>
          )}
        />
      </Modal>
      <Modal
        title="Delete this recovery copy?"
        open={pendingDeletion !== null}
        okText="Delete copy"
        okButtonProps={{ danger: true }}
        confirmLoading={busy}
        onCancel={() => {
          if (!busy) setPendingDeletion(null);
        }}
        onOk={async () => {
          const draft = pendingDeletion;
          if (!draft) return;
          await controller.discard(draft);
          setPendingDeletion(null);
        }}
      >
        <Typography.Paragraph>
          {pendingDeletion ? titleOf(pendingDeletion) : ''}
        </Typography.Paragraph>
        <Typography.Paragraph>
          This deletes only the selected recovery copy. Download it first if you need to keep it.
          Pending edits in an open window may create another copy.
        </Typography.Paragraph>
      </Modal>
    </>
  );
}
