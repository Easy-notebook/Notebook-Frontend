import { useState } from 'react';
import { useNotebookAgentIdentity } from '@Hooks/useNotebookAgentIdentity';
import { notebookAgentProfiles } from '@Services/agent-cell/NotebookAgentIdentity';
import { NotebookAgentLogo } from './NotebookAgentLogo';

export function TerminalAgentIdentity({ notebookId }: { notebookId: string }) {
  const { identity, error } = useNotebookAgentIdentity(notebookId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: '',
    logo: '',
    provider: 'codex' as 'codex' | 'claude',
  });
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState('');
  const [revision, setRevision] = useState(0);
  const save = async () => {
    if (!identity) return;
    setSaving(true);
    setFailure('');
    try {
      await notebookAgentProfiles.save({ ...identity, revision }, draft);
      setEditing(false);
    } catch (error) {
      setFailure(String(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <details open className="px-5 pt-3 text-xs text-slate-600 dark:text-slate-300">
      <summary className="cursor-pointer" title="查看 Notebook Agent 详情">
        {identity ? (
          <span className="inline-flex items-center gap-1">
            @ <NotebookAgentLogo logo={identity.logo} /> {identity.name} · Terminal
          </span>
        ) : (
          error || '读取 Notebook Agent 身份…'
        )}
      </summary>
      {identity && (
        <div className="mt-2 space-y-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 break-all">
            <dt>Agent ID</dt>
            <dd>{identity.agentId}</dd>
            <dt>AAL 类型</dt>
            <dd>{identity.className}</dd>
            <dt>模型提供方</dt>
            <dd>{identity.provider}</dd>
          </dl>
          {!editing ? (
            <button
              className="underline"
              onClick={() => {
                setDraft({ name: identity.name, logo: identity.logo, provider: identity.provider });
                setRevision(identity.revision);
                setFailure('');
                setEditing(true);
              }}
            >
              配置名称、logo 和模型
            </button>
          ) : (
            <form
              className="grid gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <label>
                名称{' '}
                <input
                  aria-label="Agent 名称"
                  value={draft.name}
                  maxLength={80}
                  required
                  disabled={saving}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="rounded border bg-transparent p-1"
                />
              </label>
              <label>
                Logo 文字或 Emoji{' '}
                <input
                  aria-label="Agent logo"
                  value={draft.logo.startsWith('data:') ? '' : draft.logo}
                  maxLength={8}
                  disabled={saving}
                  onChange={(e) => setDraft({ ...draft, logo: e.target.value })}
                  className="rounded border bg-transparent p-1"
                />
              </label>
              <label>
                上传 Logo{' '}
                <input
                  aria-label="上传 Agent logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={saving}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (
                      file.size > 96000 ||
                      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
                    ) {
                      setFailure('请选择不超过 96 KB 的 PNG、JPEG 或 WebP');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () =>
                      setDraft((current) => ({ ...current, logo: String(reader.result) }));
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              <label>
                模型提供方{' '}
                <select
                  aria-label="模型提供方"
                  value={draft.provider}
                  disabled={saving}
                  onChange={(e) =>
                    setDraft({ ...draft, provider: e.target.value as 'codex' | 'claude' })
                  }
                  className="rounded border bg-transparent p-1"
                >
                  <option value="codex">Codex</option>
                  <option value="claude">Claude</option>
                </select>
              </label>
              <div className="flex gap-3">
                <button type="submit" disabled={saving || !draft.name.trim() || !draft.logo}>
                  {saving ? '保存中…' : '保存 Agent 配置'}
                </button>
                <button type="button" disabled={saving} onClick={() => setEditing(false)}>
                  取消
                </button>
              </div>
              {failure && <p role="alert">{failure}</p>}
            </form>
          )}
        </div>
      )}
    </details>
  );
}
