import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AnsiUp } from 'ansi_up';
import { OutputRenderer } from './OutputRenderers';

it('isolates a child render failure and recovers when that output is replaced', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const bad = {
      type: 'html',
      key: 'broken',
      content: {
        toString() {
          throw new Error('bad payload');
        },
      },
    };
    let view!: ReturnType<typeof render>;
    expect(() => {
      view = render(
        <>
          <OutputRenderer output={bad} />
          <OutputRenderer output={{ type: 'text', key: 'safe', content: 'unaffected' }} />
        </>
      );
    }).not.toThrow();
    expect(screen.getByRole('alert').textContent).toBe('Error rendering output');
    expect(screen.getByText('unaffected')).toBeDefined();
    view.rerender(
      <>
        <OutputRenderer output={{ type: 'html', key: 'broken', content: 'recovered' }} />
        <OutputRenderer output={{ type: 'text', key: 'safe', content: 'unaffected' }} />
      </>
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('recovered')).toBeDefined();
  } finally {
    log.mockRestore();
  }
});

it.each(['text', 'error', 'html'])('renders zero and false as visible %s output', (type) => {
  render(
    <>
      <OutputRenderer output={{ type, content: 0, key: 'zero' }} />
      <OutputRenderer output={{ type, content: false, key: 'false' }} />
    </>
  );
  expect(screen.getByText('0')).toBeDefined();
  expect(screen.getByText('false')).toBeDefined();
});

it('replaces a failed image with a visible fresh image and removes stale errors', () => {
  const view = render(
    <OutputRenderer output={{ type: 'image', content: 'broken.png', key: 'image' }} />
  );
  const old = screen.getByRole('img');
  fireEvent.error(old);
  fireEvent.error(old);
  expect(screen.getAllByText('Image load error')).toHaveLength(1);
  view.rerender(<OutputRenderer output={{ type: 'image', content: 'valid.png', key: 'image' }} />);
  const current = screen.getByRole('img');
  expect(current.getAttribute('src')).toBe('valid.png');
  expect(current.style.display).not.toBe('none');
  expect(screen.queryByText('Image load error')).toBeNull();
  fireEvent.error(old);
  expect(screen.queryByText('Image load error')).toBeNull();
  view.rerender(<OutputRenderer output={{ type: 'image', content: 'broken.png', key: 'image' }} />);
  expect(screen.getByRole('img').getAttribute('src')).toBe('broken.png');
});

it('does not reparse unchanged ANSI output when its parent rerenders', () => {
  const parse = vi.spyOn(AnsiUp.prototype, 'ansi_to_html');
  try {
    const output = { type: 'text', content: 'unchanged', key: 'first' };
    const view = render(<OutputRenderer output={output} />);
    view.rerender(<OutputRenderer output={output} />);
    expect(parse).toHaveBeenCalledOnce();
    view.rerender(<OutputRenderer output={{ ...output, content: 'changed' }} />);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(screen.getByText('changed')).toBeDefined();
  } finally {
    parse.mockRestore();
  }
});

it('does not leak unclosed ANSI formatting into another independent output', () => {
  const view = render(
    <>
      <OutputRenderer output={{ type: 'text', content: '\u001b[31mred', key: 'red' }} />
      <OutputRenderer output={{ type: 'text', content: 'plain', key: 'plain' }} />
    </>
  );
  const outputs = view.container.querySelectorAll('pre');
  expect(outputs[0].querySelector('span')).not.toBeNull();
  expect(outputs[1].innerHTML).toBe('plain');
});
