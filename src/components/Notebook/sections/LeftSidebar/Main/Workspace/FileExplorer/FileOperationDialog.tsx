import { useMemo, useState } from 'react';
import { Input, Modal, TreeSelect } from 'antd';
import type { FileNode } from '@Services/notebook/FileListSession';
import { NotebookFileCommands } from '@Services/notebook/NotebookFileCommands';

export type FileOperation =
  | { kind: 'file' | 'folder'; parent: string }
  | { kind: 'rename' | 'move'; file: FileNode };
type FolderOption = { title: string; value: string; disabled: boolean; children: FolderOption[] };
const parentOf = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/';
export function FileOperationDialog({
  operation,
  notebookId,
  revision,
  nodes,
  onClose,
  onComplete,
}: {
  operation: FileOperation;
  notebookId: string;
  revision?: number;
  nodes: FileNode[];
  onClose: () => void;
  onComplete: (source: string | undefined, destination: string) => Promise<void>;
}) {
  const source = 'file' in operation ? operation.file : undefined;
  const [observedRevision] = useState(revision);
  const [name, setName] = useState(source?.name ?? '');
  const [parent, setParent] = useState(
    source ? parentOf(source.path) : 'parent' in operation ? operation.parent : '/'
  );
  const [status, setStatus] = useState<'editing' | 'saving'>('editing');
  const [error, setError] = useState('');
  const folders = useMemo(() => {
    const visit = (items: FileNode[]): FolderOption[] =>
      items.flatMap((node) => {
        if (
          node.type !== 'directory' ||
          (source && (node.path === source.path || node.path.startsWith(source.path + '/')))
        )
          return [];
        return [
          {
            title: node.name,
            value: node.path,
            disabled: node.creatable !== true,
            children: visit(node.children),
          },
        ];
      });
    return [{ title: '工作区', value: '/', disabled: false, children: visit(nodes) }];
  }, [nodes, source]);
  const submit = async () => {
    if (status === 'saving') return;
    try {
      const destination = NotebookFileCommands.child(parent, name);
      if (source?.path === destination) {
        onClose();
        return;
      }
      setError('');
      setStatus('saving');
      const commands = new NotebookFileCommands(notebookId);
      if (source) await commands.move(source.path, destination, observedRevision);
      else await commands.create(destination, operation.kind === 'folder');
      await onComplete(source?.path, destination);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setStatus('editing');
    }
  };
  const title = { file: '新建文件', folder: '新建文件夹', rename: '重命名', move: '移动到…' }[
    operation.kind
  ];
  return (
    <Modal
      open
      title={title}
      onCancel={onClose}
      onOk={submit}
      confirmLoading={status === 'saving'}
      cancelButtonProps={{ disabled: status === 'saving' }}
      closable={status !== 'saving'}
      maskClosable={false}
      keyboard={status !== 'saving'}
      okText="确认"
      cancelText="取消"
      width={420}
    >
      <div className="space-y-3 py-3">
        {operation.kind === 'move' ? (
          <>
            <p className="text-xs text-slate-500">{source?.path}</p>
            <TreeSelect
              aria-label="目标文件夹"
              className="w-full"
              value={parent}
              onChange={setParent}
              treeData={folders}
              treeDefaultExpandAll
              disabled={status === 'saving'}
            />
          </>
        ) : (
          <>
            <label htmlFor="explorer-entry-name" className="block text-xs">
              名称
            </label>
            <Input
              id="explorer-entry-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onPressEnter={submit}
              disabled={status === 'saving'}
              status={error ? 'error' : undefined}
            />
            <p className="text-xs text-slate-500">位置：{parent === '/' ? '工作区' : parent}</p>
          </>
        )}
        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
