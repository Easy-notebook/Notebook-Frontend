import { describe, it, expect, vi } from 'vitest';
import { mermaidRenderService } from '../rendering/MermaidRenderService';
import { MermaidCellExecution } from './MermaidCellExecution';

describe('Mermaid code cell output', () => {
  it('returns an ordinary persisted image output', async () => {
    const render = vi
      .spyOn(mermaidRenderService, 'render')
      .mockResolvedValue({ svg: '<svg viewBox="0 0 120 80"><text>A</text></svg>' });
    const signal = new AbortController().signal;
    const result = await new MermaidCellExecution().execute('graph TD; A-->B', signal);
    expect(result.status).toBe('ok');
    expect(result.outputs?.[0].type).toBe('image');
    expect(decodeURIComponent(result.outputs![0].content.split(',')[1])).toContain(
      'width="120" height="80"'
    );
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'graph TD; A-->B', signal })
    );
    render.mockRestore();
  });
  it('never publishes a render completed after cancellation', async () => {
    const controller = new AbortController();
    const render = vi.spyOn(mermaidRenderService, 'render').mockImplementation(async () => {
      controller.abort();
      return { svg: '<svg />' };
    });
    await expect(
      new MermaidCellExecution().execute('graph TD; A-->B', controller.signal)
    ).rejects.toThrow();
    render.mockRestore();
  });
});
