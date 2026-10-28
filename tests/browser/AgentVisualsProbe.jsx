import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/i18n';
import '../../src/index.css';
import { AgentTree } from '../../src/components/AgentVisuals/AgentTree';
import { AgentLanes } from '../../src/components/AgentVisuals/AgentLanes';
import NotebookEditor from '../../src/components/Editor/Lexical/NotebookEditor';
import QACard from '../../src/components/Notebook/sections/RightSideBar/AIAgentSidebar/components/QACard';
import useStore from '../../src/store/notebookStore';
import { newAgentCellData } from '../../src/services/agent-cell/protocol';
const now = Date.now();
const root = {
  id: 'root',
  name: 'Orchestrator',
  avatar: 'claude',
  model: 'Opus 5.5',
  status: 'running',
  task: 'Launch the new pricing page by Friday',
  cost: 0.43,
  started: now - 61000,
  tools: ['slack', 'notion', 'github'],
  children: [
    {
      id: 'research',
      name: 'Researcher',
      avatar: 'claude',
      model: 'Sonnet 5.5',
      status: 'done',
      task: 'Compare the pricing of five competitors',
      cost: 0.18,
      started: now - 45000,
      ended: now,
      tools: ['notion', 'slack'],
      children: [
        {
          id: 'scraper',
          name: 'Scraper',
          avatar: 'gemini',
          model: 'Gemini 3.8 Flash',
          status: 'done',
          task: 'Read the pricing pages of Linear, Notion and three more',
          cost: 0.03,
          started: now - 22000,
          ended: now,
        },
        {
          id: 'analyst',
          name: 'Analyst',
          avatar: 'claude',
          model: 'Sonnet 5.5',
          status: 'done',
          task: 'Summarize 120 G2 reviews that mention price',
          cost: 0.08,
          started: now - 27000,
          ended: now,
        },
      ],
    },
    {
      id: 'writer',
      name: 'Writer',
      avatar: 'claude',
      model: 'Sonnet 5.5',
      status: 'waiting',
      task: 'Draft the pricing page',
      ask: 'Publish this draft for review?',
      cost: 0.29,
    },
    {
      id: 'coder',
      name: 'Coder',
      avatar: 'codex',
      model: 'GPT-6 Sol',
      status: 'running',
      task: 'Build the page',
      cost: 0.32,
      children: [
        {
          id: 'tester',
          name: 'Tester',
          avatar: 'codex',
          model: 'GPT-6 Sol',
          status: 'failed',
          task: 'Check the checkout flow',
          error: 'Checkout timed out. Retry the check?',
          cost: 0.08,
        },
      ],
    },
  ],
};
const agents = [
  { id: 'research', name: 'Researcher', avatar: 'claude', model: 'Opus 5.5' },
  { id: 'writer', name: 'Writer', avatar: 'claude', model: 'Sonnet 5.5' },
  { id: 'review', name: 'Reviewer', avatar: 'codex', model: 'GPT-6 Sol' },
  { id: 'ops', name: 'Ops', avatar: 'gemini', model: 'Gemini 3.8 Flash' },
];
const tasks = [
  {
    id: 'interviews',
    agentId: 'research',
    title: 'Customer interviews',
    status: 'running',
    start: now - 1150000,
    tools: ['notion', 'slack'],
    summary: 'Interview synthesis is in progress.',
  },
  {
    id: 'draft',
    agentId: 'writer',
    title: 'Draft pricing page',
    status: 'done',
    start: now - 1500000,
    end: now - 400000,
    handoffTo: 'review',
    tools: ['figma', 'notion'],
    summary: ['Draft completed', 'Sent to Reviewer'],
  },
  {
    id: 'review',
    agentId: 'review',
    title: 'Review pricing',
    status: 'waiting',
    start: now - 400000,
    ask: 'Approve the pricing page draft?',
    tools: ['figma'],
  },
  {
    id: 'rotate',
    agentId: 'ops',
    title: 'Rotate API keys',
    status: 'running',
    start: now - 1300000,
    tools: ['slack', 'github'],
  },
];
const fence = (language, data) => '```' + language + '\n' + JSON.stringify(data, null, 2) + '\n```';
const agentData = newAgentCellData();
agentData.turns = [
  {
    id: 'demo-turn',
    prompt: 'Inspect the notebook cells',
    answer:
      'The notebook contains two agent visualizations. This is a UI fixture; no live agent was invoked.',
    status: 'completed',
    actions: [
      {
        id: 'list',
        name: 'list_cells',
        status: 'completed',
        result: { ok: true, data: { count: 2 } },
      },
    ],
  },
];
useStore.setState({
  notebookId: 'agent-visuals-fixture',
  cells: [
    { id: 'title', type: 'markdown', content: '# Markdown components' },
    { id: 'tree', type: 'markdown', content: fence('agent-tree', { root, now }) },
    { id: 'lanes', type: 'markdown', content: fence('agent-lanes', { agents, tasks, now }) },
    { id: 'agent', type: 'agent', content: '', metadata: { agent: agentData } },
  ],
});
function App() {
  const [dark, setDark] = useState(true);
  const [narrow, setNarrow] = useState(false);
  const [laneTasks, setLaneTasks] = useState(tasks);
  const [tree, setTree] = useState(root);
  const [message, setMessage] = useState('');
  return (
    <div
      data-theme={dark ? 'dark' : 'light'}
      className={dark ? 'dark' : ''}
      style={{
        minHeight: '100vh',
        background: dark ? '#20232b' : '#f5f6f8',
        padding: '24px 16px',
        color: dark ? '#eee' : '#222',
      }}
    >
      <main style={{ maxWidth: narrow ? 480 : 1000, margin: 'auto' }}>
        <nav style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          <button onClick={() => setDark(!dark)}>Toggle theme</button>
          <button onClick={() => setNarrow(!narrow)}>Toggle width</button>
          <span>交互示例 · 状态操作仅修改示例</span>
          <a href="/tests/browser/agent-live.html">打开真实 Codex / Claude 执行</a>
        </nav>
        <AgentLanes
          agents={agents}
          tasks={laneTasks}
          onApprove={(task) =>
            setLaneTasks((items) =>
              items.map((item) => (item.id === task.id ? { ...item, status: 'running' } : item))
            )
          }
          onReject={(task) =>
            setLaneTasks((items) =>
              items.map((item) =>
                item.id === task.id ? { ...item, status: 'stopped', end: Date.now() } : item
              )
            )
          }
          onOpen={(task) => setMessage(task.title)}
        />
        <p role="status">{message}</p>
        <AgentTree
          root={tree}
          onResolve={(agent, action) => {
            const update = (node) => ({
              ...node,
              status:
                node.id === agent.id
                  ? { approve: 'running', reject: 'stopped', retry: 'running', dismiss: 'stopped' }[
                      action
                    ]
                  : node.status,
              children: node.children?.map(update),
            });
            setTree(update(tree));
          }}
        />
        <h2 style={{ marginTop: 32 }}>Chat</h2>
        <QACard
          qa={{
            id: 'q',
            type: 'user',
            content: 'Show the agent workflow and its progress.',
            timestamp: '10:30',
          }}
          index={0}
          totalCount={2}
        />
        <QACard
          qa={{
            id: 'a',
            type: 'assistant',
            agent: 'Codex',
            content:
              'Here is the current workflow.\n\n' + fence('agent-lanes', { agents, tasks, now }),
            timestamp: '10:31',
          }}
          index={1}
          totalCount={2}
        />
        <section style={{ marginTop: 32 }}>
          <NotebookEditor />
        </section>
      </main>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
