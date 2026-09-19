import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MarkdownImage, MarkdownTable, MarkdownTableRow, MarkdownTableCell, MarkdownTableHead } from './MarkdownElements';

it('renders a flow-content table wrapper without leaking parser nodes into DOM attributes', () => {
  const view = render(<ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    table: MarkdownTable, tr: MarkdownTableRow, td: MarkdownTableCell, th: MarkdownTableHead,
  }}>{'| Left | Right |\n| :--- | ---: |\n| A | B |'}</ReactMarkdown>);
  expect(view.container.querySelector('div.table-container > table')).toBeTruthy();
  expect(view.container.querySelector('span > table')).toBeNull();
  expect(view.container.querySelector('[node]')).toBeNull();
  expect(view.container.querySelectorAll('th')).toHaveLength(2);
  expect(view.container.querySelectorAll('td')).toHaveLength(2);
  expect(view.container.querySelectorAll('td')[1].style.textAlign).toBe('right');
});

it('retains native cell attributes and caller styles', () => {
  const view = render(<MarkdownTable style={{ minWidth: '500px' }}><tbody><MarkdownTableRow>
    <MarkdownTableCell colSpan={2} style={{ textAlign: 'right' }}>Content</MarkdownTableCell>
  </MarkdownTableRow></tbody></MarkdownTable>);
  expect(view.container.querySelector('td')?.colSpan).toBe(2);
  expect(view.container.querySelector('td')?.style.textAlign).toBe('right');
  expect(view.container.querySelector('table')?.style.minWidth).toBe('500px');
});

it('defers Markdown images by default without leaking parser data', () => {
  const view = render(<ReactMarkdown components={{ img: MarkdownImage }}>{'![Diagram](/diagram.png "Example")'}</ReactMarkdown>);
  const image = view.container.querySelector('img')!;
  expect(image.getAttribute('loading')).toBe('lazy');
  expect(image.getAttribute('decoding')).toBe('async');
  expect(image.alt).toBe('Diagram');
  expect(image.title).toBe('Example');
  expect(image.getAttribute('src')).toBe('/diagram.png');
  expect(image.hasAttribute('node')).toBe(false);
});

it('retains image dimensions, responsive sources and explicit loading policy', () => {
  const view = render(<MarkdownImage src="/small.png" srcSet="/large.png 2x"
    width={640} height={480} loading="eager" decoding="sync" style={{ maxWidth: '640px' }} />);
  const image = view.container.querySelector('img')!;
  expect(image.width).toBe(640);
  expect(image.height).toBe(480);
  expect(image.getAttribute('srcset')).toBe('/large.png 2x');
  expect(image.getAttribute('loading')).toBe('eager');
  expect(image.getAttribute('decoding')).toBe('sync');
  expect(image.style.maxWidth).toBe('640px');
});
