import { RenderDiagnosticsContext } from '../../src/components/AgentVisuals/RenderDiagnostics';
import React, { Profiler } from 'react';
import { AgentPerformanceProbe, recordAgentCommit } from './AgentPerformanceProbe';
import { createRoot } from 'react-dom/client';
import '../../src/i18n';
import '../../src/index.css';
import { persistenceService } from '../../src/services/persistence/instance';
import useStore from '../../src/store/notebookStore';
import { newAgentCellData } from '../../src/services/agent-cell/protocol';
import NotebookEditor from '../../src/components/Editor/Lexical/NotebookEditor';
import { NotebookAgentChat } from '../../src/components/Notebook/sections/RightSideBar/AIAgentSidebar/components/NotebookAgentChat';
await persistenceService.initialize();
useStore.setState({
  notebookId: 'agent-live-verification',
  cells: [
    { id: 'title', type: 'markdown', content: '# Live Agent verification' },
    { id: 'notes', type: 'markdown', content: 'Verification note: original.' },
    {
      id: 'calculation',
      type: 'code',
      language: 'aal',
      content: 'agent Cell is Agent\n  public\n    ability run() -> Any\n      return 2 + 3',
      outputs: [],
    },
    {
      id: 'codex-live',
      type: 'agent',
      content: '',
      metadata: { agent: newAgentCellData('codex') },
    },
    {
      id: 'claude-live',
      type: 'agent',
      content: '',
      metadata: { agent: newAgentCellData('claude') },
    },
  ],
});
createRoot(document.getElementById('root')).render(
  <>
    <AgentPerformanceProbe />
    <RenderDiagnosticsContext.Provider value={recordAgentCommit}>
      <Profiler id="live-notebook" onRender={recordAgentCommit}>
        <main
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) 430px',
            gap: 24,
            padding: 24,
          }}
        >
          <section aria-label="Notebook">
            <NotebookEditor />
          </section>
          <aside
            aria-label="聊天侧栏"
            style={{ position: 'sticky', top: 0, maxHeight: '100vh', overflow: 'auto' }}
          >
            <h2>真实 Agent 调用</h2>
            <p>所有按钮连接当前 notebook，会实际修改或运行 cell。</p>
            <NotebookAgentChat />
          </aside>
        </main>
      </Profiler>
    </RenderDiagnosticsContext.Provider>
  </>
);
