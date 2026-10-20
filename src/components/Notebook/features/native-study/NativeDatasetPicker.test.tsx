import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NativeDatasetPicker } from './NativeDatasetPicker';
const client = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn(), upload: vi.fn() }));
vi.mock('@Services/native-study/NativeDatasetClient', () => ({
  NativeDatasetClient: class {
    list = client.list;
    read = client.read;
    upload = client.upload;
  },
}));
afterEach(() => vi.clearAllMocks());
const metadata = { name: '房屋.csv', version: 'a'.repeat(64), sha256: 'b'.repeat(64), size: 3 };
it('loads saved versions on demand and publishes selected bytes only after the read finishes', async () => {
  client.list.mockResolvedValue([metadata]);
  client.read.mockResolvedValue({ ...metadata, csv: 'a\n1' });
  const onSelect = vi.fn();
  const onBusy = vi.fn();
  render(
    <NativeDatasetPicker
      notebookId="a"
      disabled={false}
      onSelect={onSelect}
      onBusyChange={onBusy}
    />
  );
  expect(client.list).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '读取已保存 CSV' }));
  const select = await screen.findByRole('combobox', { name: '选择 CSV 文件版本' });
  fireEvent.change(select, { target: { value: metadata.version } });
  await waitFor(() => expect(onSelect).toHaveBeenCalledWith('a\n1'));
  expect(onBusy).toHaveBeenLastCalledWith(false);
  expect(screen.getByText(/最近读入：房屋.csv/)).toBeInTheDocument();
});
it('switching notebook ownership clears the catalog and suppresses the old pending read', async () => {
  let finish!: (value: unknown) => void;
  client.list.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  const props = { disabled: false, onSelect: vi.fn(), onBusyChange: vi.fn() };
  const view = render(<NativeDatasetPicker notebookId="a" {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '读取已保存 CSV' }));
  view.rerender(<NativeDatasetPicker notebookId="b" {...props} />);
  finish([metadata]);
  await waitFor(() => expect(screen.getByRole('button', { name: '读取已保存 CSV' })).toBeEnabled());
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(props.onSelect).not.toHaveBeenCalled();
});
