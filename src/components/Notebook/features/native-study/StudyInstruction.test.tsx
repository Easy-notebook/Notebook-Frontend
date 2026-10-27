import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { discussionInstruction } from '@Services/native-study/contracts';
import { StudyInstruction } from './StudyInstruction';
const instruction = {
  descriptor: { name: 'housing-discussion' as const, revision: 2, content_hash: 'a'.repeat(64) },
  content: '<script>untrusted</script> Explain measured distances.',
};
it('renders inert instructions and binds explicit feedback to the displayed hash', () => {
  const onRevise = vi.fn();
  const { container, rerender } = render(
    <StudyInstruction instruction={instruction} disabled={false} onRevise={onRevise} />
  );
  fireEvent.click(screen.getByText('调整房屋解释说明'));
  expect(container.querySelector('script')).toBeNull();
  const button = screen.getByRole('button', { name: '根据反馈修订说明' });
  const feedback = screen.getByLabelText('解释改进反馈');
  expect(button).toBeDisabled();
  fireEvent.change(feedback, { target: { value: '  ' } });
  expect(button).toBeDisabled();
  fireEvent.change(feedback, { target: { value: '解释标准化单位' } });
  fireEvent.click(button);
  expect(onRevise).toHaveBeenCalledExactlyOnceWith(
    '解释标准化单位',
    instruction.descriptor.content_hash
  );
  rerender(<StudyInstruction instruction={instruction} disabled onRevise={onRevise} />);
  expect(button).toBeDisabled();
  expect(feedback).toBeDisabled();
});
it('counts Unicode scalars consistently with the kernel and rejects malformed descriptors', () => {
  render(<StudyInstruction instruction={instruction} disabled={false} onRevise={vi.fn()} />);
  fireEvent.click(screen.getByText('调整房屋解释说明'));
  const feedback = screen.getByLabelText('解释改进反馈');
  const button = screen.getByRole('button', { name: '根据反馈修订说明' });
  fireEvent.change(feedback, { target: { value: '🏠'.repeat(8192) } });
  expect(button).toBeEnabled();
  fireEvent.change(feedback, { target: { value: '🏠'.repeat(8193) } });
  expect(button).toBeDisabled();
  expect(screen.getByRole('alert')).toBeVisible();
  expect(discussionInstruction.safeParse(instruction).success).toBe(true);
  for (const descriptor of [
    { ...instruction.descriptor, revision: 0 },
    { ...instruction.descriptor, content_hash: 'bad' },
    { ...instruction.descriptor, name: 'other' },
  ]) {
    expect(discussionInstruction.safeParse({ ...instruction, descriptor }).success).toBe(false);
  }
});
