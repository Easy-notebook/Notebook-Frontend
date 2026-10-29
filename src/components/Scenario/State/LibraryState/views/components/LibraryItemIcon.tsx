import { FileText, Folder, MessagesSquare } from 'lucide-react';
import { AgentMark } from '@/components/AgentVisuals/AgentMark';
import type { CachedNotebook } from '../../types';
export function LibraryItemIcon({ notebook }: { notebook: CachedNotebook }) {
  const { kind = 'document', providers = [] } = notebook.presentation ?? {};
  const Icon = kind === 'project' ? Folder : kind === 'chat' ? MessagesSquare : FileText;
  const label = notebook.library?.icon
    ? '自定义图标'
    : providers.length
      ? providers.map((p) => (p === 'claude' ? 'Claude Code' : 'OpenAI Codex')).join('、')
      : kind === 'project'
        ? '项目'
        : kind === 'chat'
          ? '聊天'
          : '文档';
  return (
    <span className="library-item-icon" role="img" aria-label={label}>
      {notebook.library?.icon ||
        (providers.length ? (
          providers.map((provider) => <AgentMark key={provider} name={provider} />)
        ) : (
          <Icon size={22} strokeWidth={1.5} />
        ))}
    </span>
  );
}
export function libraryKindLabel(notebook: CachedNotebook) {
  const providers = notebook.presentation?.providers ?? [];
  const type = { chat: '聊天记录', document: '文档', project: '项目' }[
    notebook.presentation?.kind ?? 'document'
  ];
  return [providers.map((p) => (p === 'claude' ? 'Claude Code' : 'Codex')).join(' + '), type]
    .filter(Boolean)
    .join(' · ');
}
