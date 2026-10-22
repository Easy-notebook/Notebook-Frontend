import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReviewRecord, ReviewSnapshot } from '@Services/native-study/SkillReviewSession';
import { SkillReviewExecution } from './SkillReviewExecution';

afterEach(cleanup);
const input = {
  workspace: 'w',
  revision: 1,
  invocation: 'original',
  csv: 'area\n40\n',
  lock: { version: 1 as const, skills: [{}] },
  selection: {
    source: 'github',
    location: 'housing',
    content_hash: 'frozen',
    model_path: 'houses.aalkm',
    reference: null,
  },
};
function show(phase: ReviewRecord['phase'], change: Partial<ReviewSnapshot> = {}) {
  const onResume = vi.fn();
  render(
    <SkillReviewExecution
      state={{
        record: {
          version: 1,
          input,
          phase,
          result: phase === 'completed' ? 'Old measurements' : undefined,
        },
        busy: false,
        blocked: false,
        error: null,
        ...change,
      }}
      revision={2}
      disabled={false}
      onDecide={vi.fn()}
      onExecute={vi.fn()}
      onResume={onResume}
      onClear={vi.fn()}
    />
  );
  return onResume;
}
it('offers explicit historical recovery only for an unresolved execution', () => {
  const resume = show('execute');
  expect(resume).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '取回原调用结果' }));
  expect(resume).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/输入版本：1 · 当前版本：2/)).toBeInTheDocument();
});
it.each(['request', 'decision'] as const)('keeps stale %s recovery disabled', (phase) => {
  const resume = show(phase);
  const button = screen.getByRole('button', { name: '恢复本次操作（复用原调用）' });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(resume).not.toHaveBeenCalled();
});
it('does not override a blocked storage state for historical recovery', () => {
  show('execute', { blocked: true });
  expect(screen.getByRole('button', { name: '取回原调用结果' })).toBeDisabled();
});
it('labels completed historical output separately from current input', () => {
  show('completed');
  expect(screen.getByLabelText('技能执行结果')).toHaveTextContent('Old measurements');
  expect(screen.getByRole('alert')).toHaveTextContent('此结果来自历史版本');
  expect(screen.queryByRole('button', { name: '取回原调用结果' })).not.toBeInTheDocument();
});
it.each(['pending', 'approved'] as const)('does not start stale %s calls', (status) => {
  show('ready', {
    record: {
      version: 1,
      input,
      phase: 'ready',
      approval: {
        id: 'approval',
        scope: 'scope',
        action: {
          kind: 'agent',
          request: {
            caller: 'Reviewer',
            callee: 'Reviewer',
            ability: 'run',
            invocation: input.invocation,
            call_id: 'housing-review-root',
            arguments: { csv: { kind: 'String', value: input.csv } },
          },
        },
        state: status === 'pending' ? { status } : { status, actor: 'test', reason: 'fixture' },
      },
    },
  });
  const label = status === 'pending' ? '批准本次技能调用' : '执行已批准的技能调用';
  expect(screen.getByRole('button', { name: label })).toBeDisabled();
  expect(screen.queryByRole('button', { name: '取回原调用结果' })).not.toBeInTheDocument();
});
