import { persistenceService } from '../../src/services/persistence/instance';
import { notebookContextService } from '../../src/services/notebook-context/instance';
import React from 'react';
import { createRoot } from 'react-dom/client';
import TiptapNotebookEditor from '../../src/components/Editor/TiptapNotebookEditor';
import useStore from '../../src/store/notebookStore';
import { newAgentCellData } from '../../src/services/agent-cell/protocol';
import '../../src/index.css';
import { NotebookContextPanel } from '../../src/components/Notebook/sections/LeftSidebar/Main/Workspace/Context/NotebookContextPanel';
await persistenceService.initialize();
const data = newAgentCellData();
useStore.setState({
  notebookId: 'agent-browser-fixture',
  cells: [
    { id: 'title', type: 'markdown', content: '# Notebook agent integration' },
    {
      id: 'notes',
      type: 'markdown',
      content: 'Revenue data has missing values. Inspect before changing the analysis.',
    },
    { id: 'agent', type: 'agent', content: '', metadata: { agent: data } },
  ],
});
window.agentHarness = {
  store: useStore,
  newAgentCellData,
  notebookContextService,
  persistenceService,
};
createRoot(document.getElementById('root')).render(
  <main
    style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', gap: 16, margin: 24 }}
  >
    <aside>
      <NotebookContextPanel />
    </aside>
    <TiptapNotebookEditor />
  </main>
);
