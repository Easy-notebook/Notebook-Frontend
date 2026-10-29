import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { FormulaView } from './FormulaView';
vi.mock('../../model/useMathPreview', () => ({
  useMathPreview: () => ({ html: '', error: null }),
}));
vi.mock('../../model/usePreviewStart', () => ({
  usePreviewStart: () => ({ container: { current: null }, active: false }),
}));
it('commits formula Enter without forwarding it to the notebook keyboard handler', () => {
  const parentKey = vi.fn();
  const change = vi.fn();
  render(
    <div onKeyDown={parentKey}>
      <FormulaView
        latex=""
        displayMode={true}
        readOnly={false}
        onChange={change}
        onDelete={vi.fn()}
      />
    </div>
  );
  fireEvent.click(screen.getByText('Add Formula'));
  const input = screen.getByPlaceholderText('Enter LaTeX formula, e.g. E = mc^2');
  fireEvent.change(input, { target: { value: 'x^3' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(change).toHaveBeenCalledWith({ latex: 'x^3' });
  expect(parentKey).not.toHaveBeenCalled();
});
