import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { OutputProjection } from '../model/OutputProjection';
import { OutputDisplay } from './OutputDisplay';
import useStore from '@Store/notebookStore';

vi.mock('./OutputRenderers', () => ({
  OutputRenderer: ({ output }: { output: { content: string } }) => <span>{output.content}</span>,
}));

it('requests exactly one toggle when the thinking status is clicked', () => {
  const toggle = vi.fn();
  render(
    <OutputDisplay
      outputs={[{ type: 'text', content: 'result', key: 'result' }]}
      isExecuting={false}
      elapsedTime={0}
      outputVisible
      cellMode="both"
      isInDetachedView={false}
      finished_thinking
      dslcMode
      showThinking
      onToggleThinking={toggle}
    />
  );
  fireEvent.click(screen.getByText('finished thinking'));
  expect(toggle).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'finished thinking' }).getAttribute('type')).toBe(
    'button'
  );
});

it('does not traverse unchanged output rows for clock or execution-status changes', () => {
  const outputs = Array.from({ length: 1000 }, (_, index) => ({
    type: 'text',
    key: index,
    content: String(index),
  }));
  const map = vi.spyOn(outputs, 'map');
  try {
    const props = {
      outputs,
      isExecuting: true,
      elapsedTime: 0,
      outputVisible: true,
      cellMode: 'both',
      isInDetachedView: false,
    };
    const view = render(<OutputDisplay {...props} />);
    expect(map).toHaveBeenCalledOnce();
    map.mockClear();
    view.rerender(<OutputDisplay {...props} elapsedTime={1} />);
    view.rerender(<OutputDisplay {...props} isExecuting={false} />);
    expect(map).not.toHaveBeenCalled();
    expect(screen.getByText('999')).toBeDefined();
    expect(screen.queryByText('Running')).toBeNull();
  } finally {
    map.mockRestore();
  }
});

it('retains existing output DOM across unrelated renders and appended results', () => {
  const projection = new OutputProjection();
  const source = [{ type: 'text', content: 'first result' }];
  const props = {
    outputs: projection.project(source),
    isExecuting: true,
    elapsedTime: 0,
    outputVisible: true,
    cellMode: 'both',
    isInDetachedView: false,
  };
  const view = render(<OutputDisplay {...props} />);
  const first = screen.getByText('first result');
  view.rerender(<OutputDisplay {...props} elapsedTime={1} />);
  expect(screen.getByText('first result')).toBe(first);
  view.rerender(
    <OutputDisplay
      {...props}
      outputs={projection.project([...source, { type: 'text', content: 'second result' }])}
    />
  );
  expect(screen.getByText('first result')).toBe(first);
  expect(screen.getByText('second result')).toBeDefined();
});

it('retains output DOM through the actual store serialization and append path', () => {
  const original = useStore.getState();
  try {
    useStore
      .getState()
      .setCells([
        {
          id: 'output-test',
          type: 'code',
          content: '',
          outputs: [{ type: 'text', content: 'stored first' }],
        },
      ]);
    const projection = new OutputProjection();
    const outputs = () =>
      projection.project(
        useStore.getState().cells.find((cell) => cell.id === 'output-test')!.outputs
      );
    const props = {
      outputs: outputs(),
      isExecuting: true,
      elapsedTime: 0,
      outputVisible: true,
      cellMode: 'both',
      isInDetachedView: false,
    };
    const view = render(<OutputDisplay {...props} />);
    const first = screen.getByText('stored first');
    useStore.getState().updateCellOutputs('output-test', [
      { type: 'text', content: 'stored first' },
      { type: 'text', content: 'stored second' },
    ]);
    view.rerender(<OutputDisplay {...props} outputs={outputs()} />);
    expect(screen.getByText('stored first')).toBe(first);
    expect(screen.getByText('stored second')).toBeDefined();
  } finally {
    useStore.setState(original, true);
  }
});
