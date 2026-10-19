import { expect, it, vi } from 'vitest';
import { PdfFontResources } from './PdfFontResources';
const response = () =>
  ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }) as Response;
it('shares concurrent loading, uses deployment base and publishes both font weights', async () => {
  const fetcher = vi.fn().mockResolvedValue(response());
  const fonts = new PdfFontResources(fetcher, '/app/');
  const first = fonts.load();
  expect(fonts.load()).toBe(first);
  const resources = await first;
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    '/app/fonts/NotoSansSC-Regular.ttf',
    '/app/fonts/NotoSansSC-Bold.ttf',
  ]);
  expect(resources.vfs).toEqual({
    'NotoSansSC-Regular.ttf': 'AQID',
    'NotoSansSC-Bold.ttf': 'AQID',
  });
  expect(resources.fonts.NotoSansSC.bold).not.toBe(resources.fonts.NotoSansSC.normal);
  expect(await fonts.load()).toBe(resources);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('retries after a missing font without installing a fallback', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(response())
    .mockResolvedValueOnce({ ok: false, status: 404 });
  const fonts = new PdfFontResources(fetcher, '/');
  await expect(fonts.load()).rejects.toThrow('HTTP 404');
  expect((await fonts.load()).vfs['NotoSansSC-Regular.ttf']).toBe('AQID');
  expect(fetcher).toHaveBeenCalledTimes(4);
});
it('rejects empty font responses', async () => {
  const fonts = new PdfFontResources(
    vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }),
    '/'
  );
  await expect(fonts.load()).rejects.toThrow('Empty PDF font');
});
