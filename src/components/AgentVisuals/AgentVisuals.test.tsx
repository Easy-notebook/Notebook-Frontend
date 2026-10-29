import { useState } from 'react';
import { AgentDialog } from './shared';
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { AgentTree } from './AgentTree';
import { AgentLanes } from './AgentLanes';
import { AgentVisualization } from './AgentVisualization';
const child = { id: 'child', name: 'Child', task: 'Review', status: 'failed' as const };
const root = {
  id: 'root',
  name: 'Root',
  task: 'Build',
  status: 'running' as const,
  children: [child],
};
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
describe('Agent interactions', () => {
  it('portals details outside the editor and restores the trigger after removal', async () => {
    function Inspector() {
      const [open, setOpen] = useState(false);
      return (
        <section>
          <button onClick={() => setOpen(true)}>Open inspector</button>
          {open && (
            <AgentDialog title="Inspector" variant="details" close={() => setOpen(false)}>
              <p>Actual run</p>
            </AgentDialog>
          )}
        </section>
      );
    }
    const { container } = render(<Inspector />);
    const trigger = screen.getByRole('button', { name: 'Open inspector' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Inspector' });
    expect(container.contains(dialog)).toBe(false);
    expect(await screen.findByText('Actual run')).toBeTruthy();
    const dismiss = within(dialog).getByRole('button', { name: 'Close details' });
    dismiss.focus();
    fireEvent.click(dismiss);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('keeps selected details and folded branches current across streamed tree updates', async () => {
    const { rerender } = render(<AgentTree root={root} />);
    fireEvent.click(screen.getByRole('button', { name: 'Child', exact: true }));
    const dialog = await screen.findByRole('dialog', { name: 'Child' });
    const updated = { ...child, status: 'running' as const, task: 'New live task' };
    rerender(<AgentTree root={{ ...root, children: [updated] }} />);
    expect(within(dialog).getByText('New live task')).toBeTruthy();
    expect(within(dialog).getByText('Running')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide 1 sub-agents of Root' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Child', exact: true })).toBeNull()
    );
    rerender(
      <AgentTree root={{ ...root, children: [updated, { ...child, id: 'new', name: 'New' }] }} />
    );
    expect(screen.queryByRole('button', { name: 'New', exact: true })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 sub-agents of Root' }));
    expect(screen.getByRole('button', { name: 'New', exact: true })).toBeTruthy();
    rerender(<AgentTree root={{ ...root, children: [] }} />);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'New', exact: true })).toBeNull()
    );
    expect(screen.queryByRole('group')).toBeNull();
  });
  it('collapses branches and clears a filter after its last matching status changes', async () => {
    const { rerender } = render(<AgentTree root={root} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide 1 sub-agents of Root' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Child' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '1 failed' }));
    expect(screen.getByRole('button', { name: 'Child' })).toBeTruthy();
    rerender(<AgentTree root={{ ...root, children: [{ ...child, status: 'running' }] }} />);
    expect(screen.getByRole('button', { name: 'Root' })).toBeTruthy();
  });
  it('routes retry to the selected agent without mutating caller data', () => {
    const resolve = vi.fn();
    render(<AgentTree root={root} onResolve={resolve} />);
    fireEvent.click(screen.getByRole('button', { name: 'Details for Child' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(resolve).toHaveBeenCalledWith(child, 'retry');
    expect(child.status).toBe('failed');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('never fabricates approval state and waits for authoritative input', () => {
    const agents = [{ id: 'a', name: 'Agent' }];
    const task = { id: 't', agentId: 'a', title: 'Review', status: 'waiting' as const, start: 1 };
    const { rerender } = render(<AgentLanes agents={agents} tasks={[task]} now={100} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agent: Review, waiting' }));
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    const approve = vi.fn();
    rerender(<AgentLanes agents={agents} tasks={[task]} now={100} onApprove={approve} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(approve).toHaveBeenCalledWith(task);
    expect(screen.getByRole('button', { name: 'Agent: Review, waiting' })).toBeTruthy();
    rerender(
      <AgentLanes
        agents={agents}
        tasks={[{ ...task, status: 'running' }]}
        now={100}
        onApprove={approve}
      />
    );
    expect(screen.getByRole('button', { name: 'Agent: Review, running' })).toBeTruthy();
  });
  it('counts pending tool steps without double counting their parent run', () => {
    render(
      <AgentTree
        root={{ ...root, status: 'waiting', children: [{ ...child, status: 'waiting' }] }}
        summarizeChildren
        itemLabel="步骤"
      />
    );
    expect(screen.getByRole('button', { name: '1 needs you' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '2 needs you' })).toBeNull();
  });
  it('shows the provider run status even after its tools have finished', () => {
    render(
      <AgentLanes
        agents={[{ id: 'a', name: 'Codex' }]}
        tasks={[{ id: 't', agentId: 'a', title: 'read', start: 1, end: 2, status: 'done' }]}
        now={10}
        executionStatus="running"
      />
    );
    expect(screen.getByText('Running')).toBeTruthy();
    expect(screen.queryByText('0 running')).toBeNull();
  });
  it('preserves invalid drafts and blocks stale source writes', () => {
    const change = vi.fn();
    const source = JSON.stringify({ root });
    const { rerender } = render(
      <AgentVisualization kind="agent-tree" source={source} onChange={change} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit source' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '{bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(change).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: source } });
    rerender(
      <AgentVisualization
        kind="agent-tree"
        source={JSON.stringify({ root: { ...root, name: 'New' } })}
        onChange={change}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(within(screen.getByRole('alert')).getByText(/changed while/)).toBeTruthy();
    expect(change).not.toHaveBeenCalled();
  });
});
