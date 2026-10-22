import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NativeStudyClient } from '@Services/native-study/NativeStudyClient';
import { StudyFigure } from './StudyFigure';
const props = {
  notebookId: 'houses',
  workspace: 'workspace',
  revision: 2,
  reference: 'reference',
  features: ['area', 'rooms'],
  busy: false,
};
const query = {
  workspace: 'workspace',
  expected_revision: 2,
  expected_reference_id: 'reference',
  x_feature: 'area',
  y_feature: 'rooms',
};
function snapshot() {
  return {
    frontend_notebook_id: 'houses',
    workspace: 'workspace',
    revision: 2,
    figure: {
      name: 'housing-clusters.svg' as const,
      svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      caption: 'Projection is not full-space distance',
      reference_id: 'reference',
      selected_data_id: 'selected',
      input_csv_sha256: 'a'.repeat(64),
      x_feature: 'area',
      y_feature: 'rooms',
      reference_rows: 3,
      points: [{ row: 0, cluster: 0, x: 40, y: 2 }],
    },
  };
}
const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
afterEach(() => vi.unstubAllGlobals());
it('renders only on explicit read, keeps SVG in image context and clears changed axes', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => response(snapshot()));
  vi.stubGlobal('fetch', fetch);
  render(<StudyFigure {...props} />);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '生成分群图' }));
  const image = await screen.findByRole('img', { name: '房屋分群：area 与 rooms' });
  expect(image.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
  expect(document.querySelector('svg')).toBeNull();
  expect(screen.getByRole('link', { name: '下载分群 SVG' })).toHaveAttribute(
    'download',
    'housing-clusters.svg'
  );
  expect(fetch.mock.calls[0][0]).toBe('/aal-api/workspaces/houses/figure');
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual(query);
  fireEvent.change(screen.getByLabelText('分群图横轴'), { target: { value: 'rooms' } });
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByRole('button', { name: '生成分群图' })).toBeDisabled();
});
it('aborts and ignores a late reply across away-and-back navigation and hides busy observations', async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.fn<typeof globalThis.fetch>(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      })
  );
  vi.stubGlobal('fetch', fetch);
  const view = render(<StudyFigure {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '生成分群图' }));
  const signal = fetch.mock.calls[0][1]!.signal!;
  view.rerender(<StudyFigure {...props} notebookId="other" />);
  expect(signal.aborted).toBe(true);
  view.rerender(<StudyFigure {...props} />);
  await act(async () => {
    finish(response(snapshot()));
  });
  expect(screen.queryByRole('img')).toBeNull();
  fetch.mockImplementation(async () => response(snapshot()));
  fireEvent.click(screen.getByRole('button', { name: '生成分群图' }));
  await screen.findByRole('img');
  view.rerender(<StudyFigure {...props} busy />);
  expect(screen.queryByRole('img')).toBeNull();
});
it('rejects wrong identities, axes and oversized or out-of-range figure payloads', async () => {
  for (const [key, value] of [
    ['frontend_notebook_id', 'other'],
    ['workspace', 'other'],
    ['revision', 3],
  ] as const) {
    const bad = { ...snapshot(), [key]: value };
    await expect(
      new NativeStudyClient('houses', async () => response(bad)).figure(query)
    ).rejects.toThrow();
  }
  for (const [field, value] of [
    ['reference_id', 'other'],
    ['x_feature', 'rooms'],
    ['svg', '<svg' + 'x'.repeat(512 * 1024)],
  ] as const) {
    const bad = snapshot();
    Object.assign(bad.figure, { [field]: value });
    await expect(
      new NativeStudyClient('houses', async () => response(bad)).figure(query)
    ).rejects.toThrow();
  }
  const bad = snapshot();
  bad.figure.points[0].row = 3;
  await expect(
    new NativeStudyClient('houses', async () => response(bad)).figure(query)
  ).rejects.toThrow();
});

it('displays a saved PCS artifact without fetching and hides stale references or pending edits', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const figure = snapshot().figure;
  const view = render(<StudyFigure {...props} savedFigure={figure} />);
  expect(screen.getByRole('img')).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  view.rerender(<StudyFigure {...props} savedFigure={figure} busy />);
  expect(screen.queryByRole('img')).toBeNull();
  view.rerender(<StudyFigure {...props} savedFigure={figure} reference="new-reference" />);
  expect(screen.queryByRole('img')).toBeNull();
  view.rerender(<StudyFigure {...props} savedFigure={figure} />);
  fireEvent.change(screen.getByLabelText('分群图横轴'), { target: { value: 'rooms' } });
  expect(screen.queryByRole('img')).toBeNull();
});
