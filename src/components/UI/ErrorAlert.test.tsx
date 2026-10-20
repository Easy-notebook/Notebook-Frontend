import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ErrorAlert from './ErrorAlert';

it('announces the error and exposes a named dismiss button', () => {
  const onClose = vi.fn();
  render(<ErrorAlert message="保存失败" onClose={onClose} />);
  expect(screen.getByRole('alert')).toHaveTextContent('保存失败');
  fireEvent.click(screen.getByRole('button', { name: '关闭错误提示' }));
  expect(onClose).toHaveBeenCalledOnce();
});

it('dismisses without submitting a surrounding form', () => {
  const onClose = vi.fn();
  const onSubmit = vi.fn((event) => event.preventDefault());
  render(
    <form onSubmit={onSubmit}>
      <ErrorAlert message="保存失败" onClose={onClose} />
    </form>
  );
  fireEvent.click(screen.getByRole('button'));
  expect(onClose).toHaveBeenCalledOnce();
  expect(onSubmit).not.toHaveBeenCalled();
});

it('renders a non-dismissible message when no close handler is supplied', () => {
  render(<ErrorAlert message={<strong>连接断开</strong>} />);
  expect(screen.getByText('连接断开')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
