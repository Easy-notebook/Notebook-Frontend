import { describe, it, expect, vi } from 'vitest';
import { ReadingPosition } from './ReadingViewport';
describe('reading position', () => {
  it('compensates growth above the visible paragraph and disconnects on disposal', () => {
    let resize!: () => void;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(fn: () => void) {
          resize = fn;
        }
        observe() {}
        disconnect = disconnect;
      }
    );
    const viewport = document.createElement('div');
    const content = document.createElement('div');
    const paragraph = document.createElement('p');
    viewport.append(content);
    content.append(paragraph);
    document.body.append(viewport);
    let layoutTop = 24;
    Object.defineProperty(viewport, 'clientHeight', { value: 200 });
    let scrollHeight = 600;
    Object.defineProperty(viewport, 'scrollHeight', { get: () => scrollHeight });
    viewport.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    paragraph.getBoundingClientRect = () => ({ top: layoutTop - viewport.scrollTop }) as DOMRect;
    paragraph.getClientRects = () => [{ top: 24 }] as unknown as DOMRectList;
    const changed = vi.fn();
    const position = new ReadingPosition(viewport, content, changed);
    expect(viewport.scrollTop).toBe(400);
    scrollHeight = 700;
    resize();
    expect(viewport.scrollTop).toBe(500);
    viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
    viewport.scrollTop = 0;
    viewport.dispatchEvent(new Event('scroll'));
    expect(changed).toHaveBeenLastCalledWith(true);
    layoutTop += 80;
    resize();
    expect(viewport.scrollTop).toBe(80);
    expect(paragraph.getBoundingClientRect().top).toBe(24);
    resize();
    expect(viewport.scrollTop).toBe(80);
    position.latest();
    expect(viewport.scrollTop).toBe(500);
    expect(changed).toHaveBeenLastCalledWith(false);
    scrollHeight = 800;
    resize();
    expect(viewport.scrollTop).toBe(600);
    position.dispose();
    expect(disconnect).toHaveBeenCalledOnce();
    viewport.remove();
    vi.unstubAllGlobals();
  });
});
