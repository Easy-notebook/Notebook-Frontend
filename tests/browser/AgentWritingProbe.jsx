import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/i18n';
import '../../src/index.css';
import NotebookEditor from '../../src/components/Editor/Lexical/NotebookEditor';
import useStore from '../../src/store/notebookStore';
import { ThemeProvider, useTheme } from '../../src/contexts/ThemeContext';
import { NotebookAgentTools } from '../../src/services/agent-cell/NotebookAgentTools';
import { AgentApprovalGate } from '../../src/services/agent-cell/AgentApprovalGate';
import { newAgentCellData } from '../../src/services/agent-cell/protocol';
const richDraft =
  '## 方法与验证\n\n**共用口径**与*特有口径*，使用 `schema` 和 [来源](https://example.com)。\n\n- 选择点\n- 候选集\n\n| 对象 | 约束 |\n| --- | --- |\n| 数据 | 一致 |\n\n```python\nprint(42)\n```\n\n公式 $x^2$。';
const insertion = { anchor: '当前方法说明，', position: 'after' };
const insertedText = '**新增论证**与 $x^2$，';
const notebookId = 'agent-writing-probe';
const cells = [
  { id: 'title', type: 'markdown', content: '# Data Maze · 协作书写', outputs: [] },
  {
    id: 'before',
    type: 'markdown',
    content: '已观察到的口径分两类：**共用口径**由公共代码实现；**特有口径**只属于单个数据源。',
    outputs: [],
  },
  {
    id: 'method',
    type: 'markdown',
    content: '## 方法\n\n当前方法说明，需要补充可验证的口径接口与形式化对象。',
    outputs: [],
  },
  {
    id: 'experiment',
    type: 'markdown',
    content: '## 实验设计\n\n这个段落在 Agent 工作时仍然可以编辑。',
    outputs: [],
  },
  { id: 'code', type: 'code', content: 'print("original")', language: 'python', outputs: [] },
  {
    id: 'agent',
    type: 'agent',
    content: '',
    metadata: { agent: newAgentCellData('claude') },
    outputs: [],
  },
];
useStore.setState({ notebookId, cells, isInitialized: false, isLoaded: true });
const controller = new AbortController();
const tools = new NotebookAgentTools(
  notebookId,
  'agent',
  {
    notebookId: () => useStore.getState().notebookId,
    cells: () => useStore.getState().cells,
    watch: (listener) => useStore.subscribe(listener),
    update: (id, content) => useStore.getState().updateCell(id, content),
    run: async () => {},
    cancel: async () => {},
    busy: () => false,
    summary: () => {},
    document: {
      snapshot: () => ({
        notebookId,
        notebookTitle: 'Writing test',
        cells: useStore.getState().cells,
        tasks: [],
        timestamp: 0,
      }),
      replace: (next) => useStore.getState().setCells(next),
      persist: async () => {},
      artifact: async () => ({ fileId: crypto.randomUUID(), path: '/test-outline.easynb' }),
    },
  },
  controller.signal,
  'worker',
  { name: 'Claude', color: '#d87b59' }
);
const version = async (id) => (await tools.execute('read_cell', { cellId: id })).data.version;
function Probe() {
  const { setTheme, resolvedTheme } = useTheme();
  const [error, setError] = React.useState('');
  const [outlineId, setOutlineId] = React.useState('');
  const [exported, setExported] = React.useState('');
  const invoke = async (name, args) => {
    const result = await tools.execute(name, args);
    setError(result.error ?? '');
    return result;
  };
  const propose = async (stage) =>
    invoke('propose_cell_edit', {
      cellId: 'method',
      version: await version('method'),
      intent: '方法：从已发布结果提炼口径（EvoLoop），作为 agent 之间可验证的口径接口；形式化对象',
      stage,
    });
  return (
    <>
      <nav style={{ display: 'flex', gap: 12, padding: 16, flexWrap: 'wrap' }}>
        <button
          onClick={async () => {
            for (const cellId of ['before', 'method', 'experiment']) {
              await invoke('propose_cell_edit', {
                cellId,
                version: await version(cellId),
                intent: '优化当前章节',
                stage: 'planned',
              });
            }
          }}
        >
          连续规划三节
        </button>
        <button
          onClick={async () => {
            const args = {
              cellId: 'method',
              version: await version('method'),
              content: '## 方法\n\n这份草稿可在光标处批准或拒绝。',
            };
            const failure = tools.prepareWriting('update_cell', args);
            if (failure) {
              setError(failure.error);
              return;
            }
            const gate = new AgentApprovalGate();
            const pending = gate.wait('cursor-probe', controller.signal);
            const detach = tools.bindWritingApproval('update_cell', args, (decision) =>
              gate.resolve('cursor-probe', decision)
            );
            try {
              const decision = await pending;
              if (decision === 'approve') await invoke('update_cell', args);
              else tools.rejectWriting('update_cell', args);
            } finally {
              detach();
            }
          }}
        >
          光标审批草稿
        </button>
        <button
          onClick={async () => {
            const read = await invoke('read_notebook', {});
            const backup = await invoke('backup_notebook', {
              version: read.data.version,
              label: 'Outline',
            });
            const batch = await invoke('apply_notebook_edits', {
              version: read.data.version,
              backupId: backup.data.backupId,
              outline: true,
              operations: [
                { op: 'insert', afterCellId: 'title', content: '## 二、核验与保存' },
                { op: 'insert', afterCellId: 'title', content: '## 一、协作写作' },
              ],
            });
            setOutlineId(batch.data.insertedCellIds[1]);
          }}
        >
          灰色框架
        </button>
        <button
          disabled={!outlineId}
          onClick={async () =>
            invoke('propose_cell_edit', {
              cellId: outlineId,
              version: await version(outlineId),
              intent: '展开第一节',
              stage: 'planned',
            })
          }
        >
          思考当前章节
        </button>
        <button
          disabled={!outlineId}
          onClick={async () =>
            invoke('propose_cell_edit', {
              cellId: outlineId,
              version: await version(outlineId),
              intent: '逐字展开第一节',
              stage: 'writing',
              draft:
                '## 一、协作写作\n\n先明确文章的目标和读者，再把内容组织成几个章节。尚未展开的框架保持灰色只读，只有当前正在写作的节点显示协作者光标。文字逐字出现时，流光继续向前移动，不会因为新增一个字而从头开始。确认内容之后再提交，正文才恢复正常颜色，其他待写节点仍保留为灰色框架。',
            })
          }
        >
          逐字展开框架
        </button>
        <button
          onClick={async () =>
            invoke('propose_cell_edit', {
              cellId: 'method',
              version: await version('method'),
              intent: '在方法说明中插入论证',
              insertion,
              draft: insertedText,
            })
          }
        >
          段内插入
        </button>
        <button
          onClick={async () =>
            invoke('update_cell', {
              cellId: 'method',
              version: await version('method'),
              insertion,
              content: insertedText,
            })
          }
        >
          提交插入
        </button>
        <button onClick={async () => propose('planned')}>提案</button>
        <button onClick={async () => propose('writing')}>开始生成</button>
        <button
          onClick={async () =>
            invoke('propose_cell_edit', {
              cellId: 'method',
              version: await version('method'),
              intent: '方法：展开可验证的口径接口',
              draft:
                '每个团队的 agent 从原始数据和已发布结果中提炼口径，随后通过接口提供给其他团队。',
            })
          }
        >
          生成草稿
        </button>
        <button
          onClick={async () =>
            invoke('update_cell', {
              cellId: 'method',
              version: await version('method'),
              content:
                '## 方法\n\n每个团队的 agent 从原始数据和已发布结果中提炼口径，随后通过接口提供给其他团队。\n\n### 形式化对象\n\n口径由选择点、候选集和验证约束共同定义。',
            })
          }
        >
          完成修改
        </button>
        <button
          onClick={async () =>
            invoke('propose_cell_edit', {
              cellId: 'method',
              version: await version('method'),
              intent: '**计划**：更新方法',
              draft: richDraft,
            })
          }
        >
          Markdown 草稿
        </button>
        <button
          onClick={async () =>
            invoke('update_cell', {
              cellId: 'method',
              version: await version('method'),
              content: richDraft,
            })
          }
        >
          提交 Markdown
        </button>
        <button onClick={async () => invoke('cancel_cell_edit', { cellId: 'method' })}>
          取消修改
        </button>
        <button
          onClick={async () =>
            invoke('propose_cell_edit', {
              cellId: 'code',
              version: await version('code'),
              intent: '检查并更新计算逻辑',
            })
          }
        >
          冻结代码
        </button>
        <button
          onClick={async () => {
            try {
              useStore.getState().updateCell('method', 'ILLEGAL');
            } catch (error) {
              setError(error.message);
            }
          }}
        >
          尝试外部覆盖
        </button>
        <button onClick={async () => setExported(JSON.stringify(useStore.getState().cells))}>
          查看保存内容
        </button>
        <button onClick={async () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
          切换主题
        </button>
        <button onClick={async () => controller.abort()}>停止 Agent</button>
      </nav>
      {error && <p role="alert">{error}</p>}
      <output hidden data-export>
        {exported}
      </output>
      <main style={{ maxWidth: 1100, margin: '32px auto', padding: '0 32px' }}>
        <NotebookEditor />
      </main>
    </>
  );
}
createRoot(document.getElementById('root')).render(
  <ThemeProvider>
    <Probe />
  </ThemeProvider>
);
