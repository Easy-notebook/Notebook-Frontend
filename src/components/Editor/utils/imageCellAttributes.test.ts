import { expect, it, vi } from 'vitest';
import { convertCellsToHtml } from './cellConverters';

it('escapes image HTML attributes and does not serialize store-owned generation data', () => {
  const toJSON = vi.fn(() => {
    throw new Error('Generation parameters should remain in the store');
  });
  const content = '![" onerror="bad](https://example.com/image.png?x="&y=1)';
  const root = document.createElement('div');
  root.innerHTML = convertCellsToHtml(
    [
      {
        id: 'image',
        type: 'image',
        content,
        metadata: { isGenerating: true, generationParams: { toJSON } },
      },
    ],
    false
  );
  const image = root.querySelector('[data-type="markdown-image"]')!;
  expect(image.getAttribute('data-markdown')).toBe(content);
  expect(image.getAttribute('data-alt')).toBe('" onerror="bad');
  expect(image.getAttribute('data-src')).toBe('https://example.com/image.png?x="&y=1');
  expect(root.querySelector('[onerror]')).toBeNull();
  expect(image.hasAttribute('data-generation-params')).toBe(false);
  expect(toJSON).not.toHaveBeenCalled();
});
