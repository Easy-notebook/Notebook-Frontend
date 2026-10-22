import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ImportedModel } from './ImportedModel';
const props = { notebookId: 'houses', workspace: 'workspace', revision: 1, busy: false };
const model = JSON.stringify({
  version: 1,
  training_rows: 12,
  features: [{ name: 'area', mean: 100, scale: 10 }],
  centers: [[-1], [1]],
});
function file(name: string, text: () => Promise<string>) {
  const value = new File([model], name, { type: 'application/json' });
  Object.defineProperty(value, 'text', { value: text });
  return value;
}
afterEach(() => vi.unstubAllGlobals());
it('ignores an earlier file read after a different model is selected', async () => {
  let finish!: (value: string) => void;
  render(<ImportedModel {...props} />);
  const input = screen.getByLabelText('冻结分群模型文件');
  fireEvent.change(input, {
    target: {
      files: [
        file(
          'old.json',
          () =>
            new Promise((resolve) => {
              finish = resolve;
            })
        ),
      ],
    },
  });
  fireEvent.change(input, { target: { files: [file('current.json', async () => model)] } });
  await screen.findByText('已加载：current.json');
  await act(async () => finish(model));
  expect(screen.queryByText('已加载：old.json')).not.toBeInTheDocument();
  expect(screen.getByText('已加载：current.json')).toBeInTheDocument();
});
it('aborts and hides a late assignment when the notebook revision changes', async () => {
  let finish!: (value: Response) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      })
  );
  vi.stubGlobal('fetch', fetch);
  const view = render(<ImportedModel {...props} />);
  fireEvent.change(screen.getByLabelText('冻结分群模型文件'), {
    target: { files: [file('model.json', async () => model)] },
  });
  await screen.findByText('已加载：model.json');
  fireEvent.change(screen.getByLabelText('导入模型的新样本 CSV'), {
    target: { value: 'area\n110\n' },
  });
  fireEvent.click(screen.getByRole('button', { name: '使用导入模型分群' }));
  await screen.findByText('正在计算分群…');
  const signal = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].signal!;
  view.rerender(<ImportedModel {...props} revision={2} />);
  expect(signal.aborted).toBe(true);
  await act(async () =>
    finish(
      new Response(
        JSON.stringify({
          frontend_notebook_id: 'houses',
          workspace: 'workspace',
          revision: 1,
          assignments: [{ row: 0, cluster: 1, distance_squared: 0, terms: [] }],
        })
      )
    )
  );
  expect(screen.queryByLabelText('导入模型分群结果')).not.toBeInTheDocument();
});

it('loads binary through Rust and ignores an aborted conversion after another selection', async () => {
  let finish!: (value: Response) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      })
  );
  vi.stubGlobal('fetch', fetch);
  render(<ImportedModel {...props} />);
  const binary = new File([new Uint8Array([65, 0, 255])], 'houses.aalkm');
  Object.defineProperty(binary, 'arrayBuffer', {
    value: async () => new Uint8Array([65, 0, 255]).buffer,
  });
  fireEvent.change(screen.getByLabelText('冻结分群模型文件'), { target: { files: [binary] } });
  await act(async () => {});
  expect(fetch).toHaveBeenCalledOnce();
  const signal = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].signal!;
  fireEvent.change(screen.getByLabelText('冻结分群模型文件'), {
    target: { files: [file('new.json', async () => model)] },
  });
  await screen.findByText('已加载：new.json');
  expect(signal.aborted).toBe(true);
  await act(async () =>
    finish(
      new Response(JSON.stringify({ frontend_notebook_id: 'houses', model: JSON.parse(model) }))
    )
  );
  expect(screen.queryByText('已加载：houses.aalkm')).not.toBeInTheDocument();
});

it('accepts the native decoded binary model for assignment', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ frontend_notebook_id: 'houses', model: JSON.parse(model) }))
      )
  );
  render(<ImportedModel {...props} />);
  const binary = new File([new Uint8Array([0, 255])], 'houses.aalkm');
  Object.defineProperty(binary, 'arrayBuffer', {
    value: async () => new Uint8Array([0, 255]).buffer,
  });
  fireEvent.change(screen.getByLabelText('冻结分群模型文件'), { target: { files: [binary] } });
  await screen.findByText('已加载：houses.aalkm');
  fireEvent.change(screen.getByLabelText('导入模型的新样本 CSV'), {
    target: { value: 'area\n110\n' },
  });
  expect(screen.getByRole('button', { name: '使用导入模型分群' })).toBeEnabled();
});
