import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useMemo, useState } from 'react';
import {
  AgentAvatar,
  AgentDialog,
  AgentStatusBadge,
  ChevronDown,
  Sparkles,
  ToolMarks,
  useAgentClock,
} from './shared';
import { dollars, duration, indexTree, statusLabel, type TreeAgent } from './model';
export interface AgentTreeProps {
  root: TreeAgent;
  compact?: boolean;
  collapsed?: string[];
  defaultCollapsed?: string[];
  onCollapsedChange?(ids: string[]): void;
  onResolve?(agent: TreeAgent, action: 'approve' | 'reject' | 'retry' | 'dismiss'): void;
  onSelect?(agent: TreeAgent): void;
  onCancel?(agent: TreeAgent): void;
  itemLabel?: string;
  summarizeChildren?: boolean;
  hideDismiss?: boolean;
  renderDetails?(agent: TreeAgent): React.ReactNode;
  now?: number;
  formatCost?(amount: number): string;
  title?: string;
  showHeader?: boolean;
  className?: string;
}
export function AgentTree({
  root,
  compact = false,
  collapsed,
  defaultCollapsed = [],
  onCollapsedChange,
  onResolve,
  onSelect,
  onCancel,
  renderDetails,
  itemLabel = 'agents',
  summarizeChildren = false,
  hideDismiss = false,
  now,
  formatCost = dollars,
  title = 'Agents',
  showHeader = true,
  className = '',
}: AgentTreeProps) {
  const reducedMotion = useReducedMotion();
  const transition = { duration: reducedMotion ? 0 : 0.22 };
  const { nodes, totals, costed } = useMemo(() => indexTree(root), [root]);
  const summaryNodes = summarizeChildren ? nodes.filter((node) => node.id !== root.id) : nodes;
  const hasCosts = nodes.some((node) => node.cost !== undefined);
  const [folds, setFolds] = useState(defaultCollapsed);
  const folded = new Set(collapsed ?? folds);
  const [filter, setFilter] = useState<'waiting' | 'failed' | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const activeFilter = filter && nodes.some((node) => node.status === filter) ? filter : null;
  const selectedAgent = nodes.find((node) => node.id === selected);
  const running = summaryNodes.filter((node) => node.status === 'running').length;
  const clock = useAgentClock(
    now,
    nodes.some((node) => ['running', 'waiting'].includes(node.status))
  );
  const toggle = (id: string) => {
    const next = new Set(folded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFolds([...next]);
    onCollapsedChange?.([...next]);
  };
  const render = (node: TreeAgent) => (
    <motion.div
      transition={transition}
      role="treeitem"
      aria-label={`${node.name}: ${statusLabel[node.status]}`}
      aria-expanded={node.children?.length ? !folded.has(node.id) : undefined}
      key={node.id}
      className="av-branch"
      data-status={node.status}
    >
      <article
        className={`av-tree-card${compact && !node.error && !node.ask ? ' av-tree-card--compact' : ''}`}
        data-status={node.status}
        onClick={(event) => {
          if (!(event.target as HTMLElement).closest('button')) {
            setSelected(node.id);
            onSelect?.(node);
          }
        }}
      >
        <div className="av-card-top">
          <AgentAvatar name={node.name} avatar={node.avatar} />
          <div className="av-identity">
            <button
              className="av-name"
              onClick={() => {
                setSelected(node.id);
                onSelect?.(node);
              }}
            >
              {node.name}
            </button>
            <span className="av-muted">{node.model}</span>
          </div>
          <button
            aria-label={`Details for ${node.name}`}
            onClick={() => {
              setSelected(node.id);
              onSelect?.(node);
            }}
          >
            <AgentStatusBadge status={node.status} />
          </button>
        </div>
        <p className="av-task">
          <ToolMarks tools={node.tools} />
          {node.task}
        </p>
        <footer>
          <span>
            {costed.has(node.id) && formatCost(totals.get(node.id) ?? 0)}
            <span className="av-muted">
              {node.started !== undefined && ` · ${duration(node.started, node.ended ?? clock)}`}
            </span>
          </span>
          {!!node.children?.length && (
            <button
              aria-label={`${folded.has(node.id) ? 'Show' : 'Hide'} ${node.children.length} ${itemLabel === 'agents' ? 'sub-agents' : itemLabel} of ${node.name}`}
              onClick={() => toggle(node.id)}
            >
              {node.children.length}
              <ChevronDown size={14} className={folded.has(node.id) ? 'av-folded' : ''} />
            </button>
          )}
        </footer>
      </article>
      <AnimatePresence initial={false}>
        {!!node.children?.length && !folded.has(node.id) && (
          <motion.div
            key="children"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transition}
            style={{ overflow: 'hidden' }}
          >
            <div role="group" className="av-children">
              {node.children.map((child) => render(child))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
  return (
    <section className={`av-theme av-tree ${className}`} aria-label={title}>
      {showHeader && (
        <header className="av-bar">
          <Sparkles size={15} />
          <strong>{title}</strong>
          <div className="av-totals" aria-live="polite">
            <span>
              {summaryNodes.length} {itemLabel}
            </span>
            {running > 0 && <span className="av-blue">{running} running</span>}
            {(['waiting', 'failed'] as const).map((status) => {
              const count = summaryNodes.filter((node) => node.status === status).length;
              return count ? (
                <button
                  key={status}
                  data-status={status}
                  aria-pressed={activeFilter === status}
                  onClick={() => setFilter(filter === status ? null : status)}
                >
                  {count} {status === 'waiting' ? 'needs you' : 'failed'}
                  <ChevronDown size={12} />
                </button>
              ) : null;
            })}
            {hasCosts && <b>{formatCost(totals.get(root.id) ?? 0)}</b>}
          </div>
        </header>
      )}
      <div role="tree" aria-label={title} className="av-tree-body">
        {activeFilter
          ? nodes
              .filter((node) => node.status === activeFilter)
              .map((node) => render({ ...node, children: [] }))
          : render(root)}
      </div>
      {selectedAgent && (
        <AgentDialog title={selectedAgent.name} close={() => setSelected(null)}>
          <AgentStatusBadge status={selectedAgent.status} />
          <p>{selectedAgent.task}</p>
          <p className="av-muted">
            {selectedAgent.ask || selectedAgent.error || selectedAgent.model}
          </p>
          {renderDetails?.(selectedAgent)}
          <div className="av-dialog-actions">
            {onCancel && ['running', 'waiting'].includes(selectedAgent.status) && (
              <button
                onClick={() => {
                  onCancel(selectedAgent);
                  setSelected(null);
                }}
              >
                取消运行
              </button>
            )}
            {selectedAgent.status === 'waiting' && (
              <>
                <button
                  data-dialog-primary
                  onClick={() => {
                    onResolve?.(selectedAgent, 'approve');
                    setSelected(null);
                  }}
                  disabled={!onResolve}
                >
                  Approve
                </button>
                <button
                  onClick={() => {
                    onResolve?.(selectedAgent, 'reject');
                    setSelected(null);
                  }}
                  disabled={!onResolve}
                >
                  Reject
                </button>
              </>
            )}
            {['failed', 'stopped'].includes(selectedAgent.status) && (
              <>
                <button
                  data-dialog-primary
                  onClick={() => {
                    onResolve?.(selectedAgent, 'retry');
                    setSelected(null);
                  }}
                  disabled={!onResolve}
                >
                  Retry
                </button>
                {!hideDismiss && (
                  <button
                    onClick={() => {
                      onResolve?.(selectedAgent, 'dismiss');
                      setSelected(null);
                    }}
                    disabled={!onResolve}
                  >
                    Dismiss
                  </button>
                )}
              </>
            )}
          </div>
        </AgentDialog>
      )}
    </section>
  );
}
