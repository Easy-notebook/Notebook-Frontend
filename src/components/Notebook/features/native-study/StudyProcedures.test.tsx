import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { StudyProcedures } from './StudyProcedures';

const procedure = {
  name: 'saved-housing',
  content_hash: 'a'.repeat(64),
  content: '<script>inert</script>\nFeatures: ["area", "rooms"]',
};
it('saves only a completed current comparison under a new portable name', () => {
  const save = vi.fn();
  const props = {
    procedures: [procedure],
    disabled: false,
    canSave: false,
    hasInputs: true,
    onSave: save,
    onReuse: vi.fn(),
  };
  const view = render(<StudyProcedures {...props} />);
  fireEvent.click(screen.getByText('可复用研究技能（1）'));
  const button = screen.getByRole('button', { name: '保存当前研究技能' });
  expect(button).toBeDisabled();
  view.rerender(<StudyProcedures {...props} canSave />);
  fireEvent.change(screen.getByLabelText('研究技能名称'), { target: { value: '../bad' } });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText('研究技能名称'), { target: { value: 'saved-housing' } });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText('研究技能名称'), { target: { value: 'new-housing' } });
  fireEvent.click(button);
  expect(save).toHaveBeenCalledExactlyOnceWith('new-housing');
});
it('renders instructions as inert text and uses selected saved settings with explicit inputs', () => {
  const reuse = vi.fn();
  const props = {
    procedures: [procedure],
    disabled: false,
    canSave: true,
    hasInputs: false,
    onSave: vi.fn(),
    onReuse: reuse,
  };
  const view = render(<StudyProcedures {...props} />);
  fireEvent.click(screen.getByText('可复用研究技能（1）'));
  expect(view.container.querySelector('script')).toBeNull();
  expect(view.container.querySelector('pre')?.textContent).toContain('<script>inert</script>');
  const button = screen.getByRole('button', { name: '用当前 CSV 复用所选技能' });
  expect(button).toBeDisabled();
  view.rerender(<StudyProcedures {...props} hasInputs />);
  fireEvent.click(button);
  expect(reuse).toHaveBeenCalledExactlyOnceWith('saved-housing', 'saved');
  view.rerender(<StudyProcedures {...props} hasInputs disabled />);
  expect(button).toBeDisabled();
});

it('selects observed and manual skills with the same name by explicit owner and renders evidence inertly', () => {
  const reuse = vi.fn();
  const observed = {
    ...procedure,
    origin: 'observed' as const,
    observations: '<script>observed</script>\nCommitted boundary calls: 5',
  };
  const view = render(
    <StudyProcedures
      procedures={[procedure, observed]}
      disabled={false}
      canSave
      hasInputs
      onSave={vi.fn()}
      onReuse={reuse}
    />
  );
  fireEvent.click(screen.getByText('可复用研究技能（2）'));
  fireEvent.change(screen.getByLabelText('已保存的研究技能'), {
    target: { value: 'observed/saved-housing' },
  });
  fireEvent.click(screen.getByRole('button', { name: '用当前 CSV 复用所选技能' }));
  expect(reuse).toHaveBeenCalledExactlyOnceWith('saved-housing', 'observed');
  expect(view.container.querySelector('script')).toBeNull();
  fireEvent.click(screen.getByText('查看已提交的执行记录'));
  expect(screen.getByText(/Committed boundary calls: 5/)).toBeVisible();
  fireEvent.change(screen.getByLabelText('已保存的研究技能'), {
    target: { value: 'saved-housing' },
  });
  fireEvent.click(screen.getByRole('button', { name: '用当前 CSV 复用所选技能' }));
  expect(reuse).toHaveBeenLastCalledWith('saved-housing', 'saved');
});
