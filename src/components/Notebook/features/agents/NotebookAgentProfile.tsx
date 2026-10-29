import { SessionImportPanel } from '../function-bar/SessionImportPanel';
import { useState } from 'react';
import { useNotebookAgentIdentity } from '@Hooks/useNotebookAgentIdentity';
import { notebookAgentProfiles } from '@Services/agent-cell/NotebookAgentIdentity';

export function NotebookAgentProfile({ notebookId }: { notebookId: string }) {
  const { identity, error } = useNotebookAgentIdentity(notebookId);
  const [importing, setImporting] = useState(false);
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
    <section className="py-3 text-xs text-slate-600 dark:text-slate-300">
      <h3 className="font-semibold">身份与会话</h3>
      {!identity && <p role={error ? 'alert' : 'status'}>{error || '读取 Notebook Agent 身份…'}</p>}
      {!identity && error && (
        <button
          className="block text-left underline underline-offset-4"
          onClick={() => void notebookAgentProfiles.load(notebookId).catch(() => {})}
        >
          重新读取身份
        </button>
      )}
      {identity && (
        <div className="mt-2 space-y-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 break-all">
            <dt>Agent ID</dt>
            <dd>{identity.agentId}</dd>
            <dt>AAL 类型</dt>
            <dd>{identity.className}</dd>
            <dt>模型提供方</dt>
            <dd>{identity.provider}</dd>
            {identity.source && (
              <>
                <dt>原始 session</dt>
                <dd>{identity.source.sessionId}</dd>
                <dt>项目目录</dt>
                <dd>{identity.source.cwd}</dd>
              </>
            )}
          </dl>
          <button
            className="block text-left underline underline-offset-4"
            onClick={() => setImporting(!importing)}
          >
            从 Claude Code / Codex session 导入并续聊
          </button>
          {importing && (
            <SessionImportPanel
              key={notebookId}
              profile={identity}
              close={() => setImporting(false)}
            />
          )}
          {!editing ? (
            <button
              className="block text-left underline underline-offset-4"
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
                  disabled={saving || Boolean(identity.source)}
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
    </section>
  );
}
