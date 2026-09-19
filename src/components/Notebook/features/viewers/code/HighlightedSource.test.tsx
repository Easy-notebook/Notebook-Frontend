import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import HighlightedSource from './HighlightedSource';

afterEach(cleanup);

it('preserves literal HTML source without creating executable DOM', () => {
  const source = '<script>alert("中文🐍")</script>\n<div>&amp;</div>';
  const { container } = render(<HighlightedSource isDark={false} language="html">{source}</HighlightedSource>);
  expect(container.querySelector('code')?.textContent).toBe(source);
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelectorAll('.token').length).toBeGreaterThan(0);
});

it('changes theme without changing source and preserves caller layout styles', () => {
  const props = { language: 'python', customStyle: { margin: 0, padding: '16px', height: '100%' }, children: 'print("hello")\n' };
  const view = render(<HighlightedSource {...props} isDark={false} />);
  const lightBackground = view.container.querySelector('pre')!.style.background;
  view.rerender(<HighlightedSource {...props} isDark />);
  const pre = view.container.querySelector('pre')!;
  expect(pre.style.background).not.toBe(lightBackground);
  expect(pre.style.padding).toBe('16px');
  expect(pre.style.height).toBe('100%');
  expect(view.container.querySelector('code')?.textContent).toBe(props.children);
});
