import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StudyProgress } from './StudyProgress';
afterEach(cleanup);
describe('native progress presentation', () => {
  it('shows actual model activity and call counts without an estimated percentage', () => {
    render(
      <StudyProgress
        progress={{
          status: 'observed',
          observation: {
            attempt: 'id',
            workspace: 'a',
            ability: 'communication',
            phase: 'running',
            completed_calls: 7,
            failed_calls: 1,
            active: { model: 1, skill: 0, other: 0 },
          },
        }}
      />
    );
    expect(screen.getByRole('status').textContent).toContain('正在等待模型回答');
    expect(screen.getByRole('status').textContent).toContain('调用 7');
    expect(screen.getByRole('status').textContent).toContain('调用 1');
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
  it('does not interpret restart or observation loss as nonexecution', () => {
    render(<StudyProgress progress={{ status: 'unknown', observation: null }} />);
    expect(screen.getByRole('status').textContent).toContain('不代表操作未执行');
  });
});
