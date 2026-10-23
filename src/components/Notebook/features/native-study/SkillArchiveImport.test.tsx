import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SkillArchiveImport } from './SkillArchiveImport';
const io = vi.hoisted(() => ({
  inspect: vi.fn(),
  accept: vi.fn(),
  models: vi.fn(),
  download: vi.fn(),
}));
vi.mock('@Services/native-study/SkillArchiveClient', () => ({
  SkillArchiveClient: class {
    inspect = io.inspect;
    accept = io.accept;
  },
}));
vi.mock('@Services/native-study/SkillModelClient', () => ({
  SkillModelClient: class {
    inspect = io.models;
  },
}));
vi.mock('@Services/notebook/BrowserDownload', () => ({ downloadBlob: io.download }));
const props = { notebookId: 'n', workspace: 'w', revision: 1, busy: false, onImported: vi.fn() };
const response = { content_hash: 'sha256:test', scan: { verdict: 'caution' }, candidate: {} };
function choose() {
  const file = new File(['zip'], 'houses.zip');
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([1, 2]).buffer });
  fireEvent.change(screen.getByLabelText('技能档案文件'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: '检查技能档案' }));
}
async function confirm() {
  await screen.findByText('扫描结果：需要注意');
  fireEvent.change(screen.getByLabelText('审核人'), { target: { value: 'reviewer' } });
  fireEvent.change(screen.getByLabelText('审核说明'), { target: { value: 'Checked bytes' } });
  fireEvent.click(screen.getByLabelText('我已核对本次档案内容'));
  fireEvent.click(screen.getByRole('button', { name: '接受档案内容' }));
}
beforeEach(() => {
  vi.clearAllMocks();
  io.inspect.mockResolvedValue(response);
  io.accept.mockResolvedValue({ lock: { version: 1 } });
  io.models.mockResolvedValue([{ path: 'houses.aalkm' }]);
});
it('requires explicit review and explicit model transfer; downloads the accepted lock', async () => {
  render(<SkillArchiveImport {...props} />);
  choose();
  await screen.findByText('扫描结果：需要注意');
  expect(screen.getByRole('button', { name: '接受档案内容' })).toBeDisabled();
  expect(io.accept).not.toHaveBeenCalled();
  await confirm();
  await screen.findByText('内容已接受，尚未授权技能执行。');
  expect(props.onImported).not.toHaveBeenCalled();
  expect(io.accept).toHaveBeenCalledWith(
    expect.objectContaining({ workspace: 'w', expected_revision: 1, bytes: [1, 2] }),
    'sha256:test',
    'reviewer',
    'Checked bytes',
    expect.any(AbortSignal)
  );
  fireEvent.click(screen.getByRole('button', { name: '使用档案中的房屋模型' }));
  expect(props.onImported).toHaveBeenCalledWith(
    { version: 1 },
    [{ path: 'houses.aalkm' }],
    'houses.zip'
  );
  fireEvent.click(screen.getByRole('button', { name: '下载已审核锁文件' }));
  expect(io.download).toHaveBeenCalledWith(expect.any(Blob), 'house-feature-review.lock.json');
});
it('cannot accept a dangerous candidate', async () => {
  io.inspect.mockResolvedValue({ ...response, scan: { verdict: 'dangerous' } });
  render(<SkillArchiveImport {...props} />);
  choose();
  await screen.findByText('扫描结果：禁止接受');
  expect(screen.getByLabelText('我已核对本次档案内容')).toBeDisabled();
  expect(screen.getByRole('button', { name: '接受档案内容' })).toBeDisabled();
  expect(io.accept).not.toHaveBeenCalled();
});
it('discards late acceptance when the workspace revision changes', async () => {
  let finish!: (value: unknown) => void;
  io.accept.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const view = render(<SkillArchiveImport {...props} />);
  choose();
  await confirm();
  await screen.findByText('正在核对接受记录…');
  view.rerender(<SkillArchiveImport {...props} revision={2} />);
  await act(async () => {
    finish({ lock: { version: 1 } });
  });
  expect(screen.queryByText('内容已接受，尚未授权技能执行。')).not.toBeInTheDocument();
  expect(props.onImported).not.toHaveBeenCalled();
});
